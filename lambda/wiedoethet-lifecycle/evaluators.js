/**
 * Per-template trigger logic for the lifecycle mailer.
 *
 * Each evaluator has two halves (product/specs/mail-automation-api.spec.md § Templates):
 *   candidates(ctx)              async generator of { user, group?, eligibleAt, scopeId }
 *                                — everyone who MAY be due, discovered through existing
 *                                indexes only (GSI3 USER/GROUP, GSI2, GSI1, table queries);
 *   stillApplies(ctx, candidate) the send-time re-check: is the situation that triggered
 *                                the mail still true right now? ("evaluate at send time")
 *
 * Everything that touches DynamoDB goes through `ctx.db`, and "now" is `ctx.now`,
 * so the whole file is unit-testable with an in-memory fake.
 */

import { addDays, localDate, localMidnightUtc, DAY_MS, HOUR_MS } from './time.js'

export const FUNNEL_LOOKBACK_DAYS = 30
export const EVENT_LOOKBACK_DAYS = 180
const PAGE_SIZE = 200
const TASK_SAFETY_MS = 2 * HOUR_MS // slack on index lower bounds (DST, clock skew)

// ─── Context ─────────────────────────────────────────────────────────────────

/**
 * @param {object} params
 * @param {number} params.now — epoch ms
 * @param {object} params.db — { getItem, queryByPk, queryGsi1, queryGsi2, queryGsi3 }
 * @param {number} params.maxCandidates — per-source evaluation bound
 * @param {(message: string, extra?: object) => void} params.warn
 * @param {Record<string, { enabledAt: string | null }>} params.configs — merged template configs by id
 */
export function createContext({ now, db, maxCandidates, warn, configs }) {
  return {
    now,
    db,
    maxCandidates,
    warn,
    configs,
    users: new Map(),
    userLogs: new Map(),
    userGroups: new Map(),
    groupFunnel: new Map(),
  }
}

// ─── Small pure helpers ──────────────────────────────────────────────────────

const ms = (iso) => {
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * The event day of a group as `YYYY-MM-DD` (Amsterdam), or null.
 * `eventDate` comes from an `<input type="date">` (`YYYY-MM-DD`); a full ISO
 * timestamp is tolerated and converted to its Amsterdam calendar date.
 */
export function eventDay(group) {
  const raw = group?.eventDate
  if (typeof raw !== 'string' || !raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parsed = ms(raw)
  return parsed === null ? null : localDate(parsed)
}

/** Amsterdam-local start of the day after the event, as epoch ms; null without an event date. */
export function dayAfterEventStart(group) {
  const day = eventDay(group)
  return day ? localMidnightUtc(addDays(day, 1)) : null
}

/** True when the event date lies before today (Amsterdam) — "the event is past". */
export function isEventPast(group, now) {
  const day = eventDay(group)
  return day !== null && day < localDate(now)
}

/** Earliest task instant; legacy tasks have no createdAt, so fall back to the group's own. */
export function firstTaskAt(tasks, group) {
  const stamps = tasks.map((task) => ms(task.createdAt)).filter((v) => v !== null)
  return stamps.length > 0 ? Math.min(...stamps) : ms(group.createdAt)
}

// ─── Cached lookups ──────────────────────────────────────────────────────────

export async function getUser(ctx, userId) {
  if (!ctx.users.has(userId)) {
    ctx.users.set(userId, await ctx.db.getItem(`USER#${userId}`, 'PROFILE'))
  }
  return ctx.users.get(userId)
}

/** All lifecycle log rows of a user (one query serves dedupe, caps, gap and the dormant chain). */
export async function getUserLog(ctx, userId) {
  if (!ctx.userLogs.has(userId)) {
    ctx.userLogs.set(userId, await ctx.db.queryByPk(`USER#${userId}`, 'MAIL#'))
  }
  return ctx.userLogs.get(userId)
}

/** The groups a user initiated (group METADATA items). */
export async function getUserGroups(ctx, userId) {
  if (!ctx.userGroups.has(userId)) {
    const items = await ctx.db.queryGsi2(`INITIATOR#${userId}`, 'GROUP#')
    ctx.userGroups.set(userId, items.filter((item) => item.SK === 'METADATA'))
  }
  return ctx.userGroups.get(userId)
}

/**
 * `max(user.lastSeenAt ?? user.createdAt, newest initiated group.createdAt)` as epoch ms.
 * Claims are deliberately not counted (not indexed by user).
 */
export async function lastActivityAt(ctx, user) {
  const own = ms(user.lastSeenAt ?? user.createdAt) ?? 0
  const groups = await getUserGroups(ctx, user.id)
  return groups.reduce((latest, group) => Math.max(latest, ms(group.createdAt) ?? 0), own)
}

/**
 * Where a group is in the activation funnel — shared by no_tasks and no_claims so a
 * group can never be picked for both, and stops being mailed once it is `done`.
 *
 * @returns {Promise<{ stage: 'no_tasks' | 'no_claims' | 'done', tasks: object[] }>}
 */
export async function funnelStage(ctx, group) {
  if (!ctx.groupFunnel.has(group.id)) {
    const tasks = await ctx.db.queryByPk(`GROUP#${group.id}`, 'TASK#')
    let stage = 'no_tasks'
    if (tasks.length > 0) {
      const claims = await ctx.db.queryGsi1(`GCLAIM#${group.id}`)
      stage = claims.length > 0 ? 'done' : 'no_claims'
    }
    ctx.groupFunnel.set(group.id, { stage, tasks })
  }
  return ctx.groupFunnel.get(group.id)
}

// ─── Candidate sources ───────────────────────────────────────────────────────

/**
 * Pages one GSI3 partition and yields its items, bounded by `ctx.maxCandidates`.
 * `newestFirst` walks from now backwards down to `lowerBoundMs` (server-side `skGte`);
 * oldest-first walks from the beginning and stops at the first item created after
 * `upperBoundMs`.
 */
async function* pageGsi3(ctx, partition, { newestFirst, lowerBoundMs, upperBoundMs }) {
  let seen = 0
  let startKey
  do {
    const { items, lastEvaluatedKey } = await ctx.db.queryGsi3(partition, {
      scanIndexForward: !newestFirst,
      limit: PAGE_SIZE,
      exclusiveStartKey: startKey,
      ...(lowerBoundMs !== undefined ? { skGte: new Date(lowerBoundMs).toISOString() } : {}),
    })
    for (const item of items) {
      if (!newestFirst && upperBoundMs !== undefined && (ms(item.createdAt) ?? 0) > upperBoundMs) return
      if (seen >= ctx.maxCandidates) {
        ctx.warn('candidate-bound-reached', { partition, bound: ctx.maxCandidates })
        return
      }
      seen += 1
      yield item
    }
    startKey = lastEvaluatedKey ?? undefined
  } while (startKey)
}

/** Users created within `lookbackMs`, newest first. */
const recentUsers = (ctx, lookbackMs) =>
  pageGsi3(ctx, 'USER', { newestFirst: true, lowerBoundMs: ctx.now - lookbackMs - TASK_SAFETY_MS })

/** Groups created within `lookbackMs`, newest first. */
const recentGroups = (ctx, lookbackMs) =>
  pageGsi3(ctx, 'GROUP', { newestFirst: true, lowerBoundMs: ctx.now - lookbackMs - TASK_SAFETY_MS })

async function hasNoGroups(ctx, user) {
  return (await getUserGroups(ctx, user.id)).length === 0
}

const enabledAtMs = (ctx, templateId) => ms(ctx.configs?.[templateId]?.enabledAt) ?? 0

// ─── Evaluators ──────────────────────────────────────────────────────────────

const WELCOME_DELAY_MS = 30 * 60 * 1000

const welcome = {
  async *candidates(ctx) {
    // eligibleAt = createdAt + 30 min; expiry is 168 h after eligibleAt (maxAgeHours).
    for await (const user of recentUsers(ctx, 168 * HOUR_MS + WELCOME_DELAY_MS)) {
      const createdAt = ms(user.createdAt)
      if (createdAt === null) continue
      yield { user, eligibleAt: createdAt + WELCOME_DELAY_MS, scopeId: '-' }
    }
  },
  // A welcome is always due: it does not depend on what the user did since registering.
  stillApplies: () => true,
}

const noGroup = {
  async *candidates(ctx) {
    for await (const user of recentUsers(ctx, 168 * HOUR_MS + 48 * HOUR_MS)) {
      const createdAt = ms(user.createdAt)
      if (createdAt === null) continue
      yield { user, eligibleAt: createdAt + 48 * HOUR_MS, scopeId: '-' }
    }
  },
  stillApplies: (ctx, { user }) => hasNoGroups(ctx, user),
}

const noTasks = {
  async *candidates(ctx) {
    for await (const group of recentGroups(ctx, 96 * HOUR_MS + 24 * HOUR_MS)) {
      const createdAt = ms(group.createdAt)
      if (createdAt === null || !group.initiatorId) continue
      const user = await getUser(ctx, group.initiatorId)
      if (!user) continue
      yield { user, group, eligibleAt: createdAt + 24 * HOUR_MS, scopeId: group.id }
    }
  },
  async stillApplies(ctx, { group }) {
    if (isEventPast(group, ctx.now)) return false
    return (await funnelStage(ctx, group)).stage === 'no_tasks'
  },
}

const noClaims = {
  async *candidates(ctx) {
    for await (const group of recentGroups(ctx, FUNNEL_LOOKBACK_DAYS * DAY_MS)) {
      if (!group.initiatorId) continue
      if (isEventPast(group, ctx.now)) continue
      const { stage, tasks } = await funnelStage(ctx, group)
      if (stage !== 'no_claims') continue
      const user = await getUser(ctx, group.initiatorId)
      if (!user) continue
      yield { user, group, eligibleAt: firstTaskAt(tasks, group) + 96 * HOUR_MS, scopeId: group.id }
    }
  },
  async stillApplies(ctx, { group }) {
    if (isEventPast(group, ctx.now)) return false
    return (await funnelStage(ctx, group)).stage === 'no_claims'
  },
}

const dayAfterEvent = {
  async *candidates(ctx) {
    // Events that ended in the last week, not only "yesterday": there are no weekend runs,
    // so a Saturday event is only mailed on Monday. maxAgeHours (96 h) still drops stale ones,
    // and the per-group log key keeps it to one mail.
    const today = localDate(ctx.now)
    const earliest = addDays(today, -7)
    for await (const group of recentGroups(ctx, EVENT_LOOKBACK_DAYS * DAY_MS)) {
      const day = eventDay(group)
      if (!group.initiatorId || day === null || day >= today || day < earliest) continue
      const user = await getUser(ctx, group.initiatorId)
      if (!user) continue
      yield { user, group, eligibleAt: dayAfterEventStart(group), scopeId: group.id }
    }
  },
  // A real event, not an empty shell: at least one task was claimed.
  async stillApplies(ctx, { group }) {
    const claims = await ctx.db.queryGsi1(`GCLAIM#${group.id}`)
    return claims.length > 0
  },
}

/**
 * dormant_30 / dormant_60 source: users oldest-first, pre-filtered on the user
 * item's own lastSeenAt ?? createdAt so the per-user group lookup (GSI2) only
 * runs for users that could really be dormant.
 */
function dormantEvaluator(templateId, afterDays, extraCheck) {
  const threshold = afterDays * DAY_MS
  return {
    async *candidates(ctx) {
      const cutoff = ctx.now - threshold
      for await (const user of pageGsi3(ctx, 'USER', { newestFirst: false, upperBoundMs: cutoff })) {
        const seenAt = ms(user.lastSeenAt ?? user.createdAt)
        if (seenAt === null || seenAt > cutoff) continue
        const activity = await lastActivityAt(ctx, user)
        yield {
          user,
          eligibleAt: Math.max(activity + threshold, enabledAtMs(ctx, templateId)),
          scopeId: '-',
        }
      }
    },
    async stillApplies(ctx, { user }) {
      const activity = await lastActivityAt(ctx, user)
      if (activity > ctx.now - threshold) return false
      return extraCheck ? extraCheck(ctx, user, activity) : true
    },
  }
}

const dormant30 = dormantEvaluator('dormant_30', 30)

// Second and last win-back: only after dormant_30 was actually sent and the user
// stayed away since — any activity since then ends the sequence.
const dormant60 = dormantEvaluator('dormant_60', 60, async (ctx, user, activity) => {
  const rows = await getUserLog(ctx, user.id)
  const first = rows.find((row) => row.SK === 'MAIL#dormant_30#-' && row.status === 'sent')
  if (!first) return false
  return activity <= (ms(first.sentAt) ?? Infinity)
})

export const EVALUATORS = {
  welcome,
  no_group: noGroup,
  no_tasks: noTasks,
  no_claims: noClaims,
  day_after_event: dayAfterEvent,
  dormant_30: dormant30,
  dormant_60: dormant60,
}
