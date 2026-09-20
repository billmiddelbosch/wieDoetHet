/**
 * Lifecycle mail Lambda — scheduled (EventBridge Scheduler), NOT behind API Gateway.
 *
 * Finds users who hit a lifecycle trigger (welcome, no group, group without
 * tasks/claims, day after the event, dormant), re-checks the situation at send
 * time and sends each due mail exactly once via SES.
 *
 * Function name: wiedoethet-lifecycle
 * Runtime: nodejs24.x
 * Handler: index.handler
 * Trigger: cron(0 10 ? * MON-FRI *), timezone Europe/Amsterdam, retries 0
 *
 * Event: {} (scheduled) | { dryRun: true } (evaluate, send/log nothing) |
 *        { force: true } (skip only the "must be the 10:00 hour" guard)
 *
 * Full contract: product/specs/mail-automation-api.spec.md
 */

import { getItem, putItem, putItemIfAbsent, updateItem, updateItemIf, queryByPk, queryGsi1, queryGsi2, queryGsi3, keys } from '../shared/db.js'
import { sendMail } from '../shared/ses.js'
import { wrapEmailHtml } from '../shared/email-template.js'
import { LIFECYCLE_TEMPLATES, mergeTemplateConfig } from '../shared/lifecycle-templates.js'
import { buildVariables, renderTemplate } from '../shared/mail-render.js'
import { EVALUATORS, createContext, getUserLog } from './evaluators.js'
import { localParts, HOUR_MS } from './time.js'

const SEND_HOUR = 10
const DEFAULT_MAX_SENDS_PER_RUN = 50
const MAX_CANDIDATES_EVALUATED = 2000
const SEND_CONCURRENCY = 5
const MIN_GAP_MS = 72 * HOUR_MS
const MAX_ATTEMPTS = 3
const ERROR_MESSAGE_MAX = 500
const NORMAL_TIER_WEEKDAYS = [2, 3, 4] // Tue, Wed, Thu
const WEEKEND = [0, 6]

const realDb = { getItem, putItem, putItemIfAbsent, updateItem, updateItemIf, queryByPk, queryGsi1, queryGsi2, queryGsi3 }

function log(level, event, extra = {}) {
  const line = JSON.stringify({ level, event, ...extra })
  if (level === 'ERROR') console.error(line)
  else if (level === 'WARN') console.warn(line)
  else console.log(line)
}

function maxSendsPerRun(env) {
  const parsed = Number.parseInt(env.LIFECYCLE_MAX_SENDS_PER_RUN, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_SENDS_PER_RUN
}

const ms = (iso) => {
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? null : parsed
}

// ─── Decide: does this candidate get a mail in this run? ─────────────────────

/**
 * Applies the per-candidate rules in the order of the spec's run algorithm.
 *
 * @returns {Promise<{ send: true, existingLog: object | null } | { send: false, reason: string }>}
 */
async function decide(ctx, template, candidate, picked) {
  const { now } = ctx
  const skip = (reason) => ({ send: false, reason })

  if (candidate.eligibleAt > now) return skip('not-yet-eligible')
  if (template.maxAgeHours !== null && now - candidate.eligibleAt > template.maxAgeHours * HOUR_MS) return skip('expired')

  const { user } = candidate
  if (!user?.email) return skip('no-email')
  if (user.role === 'admin' || user.mailOptOut === true) return skip('excluded-user')
  if (picked.has(user.id)) return skip('already-picked')

  const rows = await getUserLog(ctx, user.id)
  const ownKey = `MAIL#${template.id}#${candidate.scopeId}`
  const own = rows.find((row) => row.SK === ownKey) ?? null
  let existingLog = null
  if (own) {
    // Exactly-once: only a failed row with attempts left is picked up again.
    if (own.status === 'failed' && (own.attempts ?? 1) < MAX_ATTEMPTS) existingLog = own
    else return skip('already-handled')
  }

  if (template.maxPerUser !== null) {
    const sameTemplate = rows.filter((row) => row !== own && row.templateId === template.id).length
    if (sameTemplate >= template.maxPerUser) return skip('max-per-user')
  }

  const gapCutoff = now - MIN_GAP_MS
  const gapViolated = rows.some((row) => {
    if (row === own) return false
    if (row.status !== 'sent' && row.status !== 'sending') return false
    if (template.gapExemptAfter.includes(row.templateId)) return false
    return (ms(row.sentAt ?? row.createdAt) ?? 0) > gapCutoff
  })
  if (gapViolated) return skip('min-gap')

  if (!(await EVALUATORS[template.id].stillApplies(ctx, candidate))) return skip('no-longer-applies')

  return { send: true, existingLog }
}

// ─── Send one mail (lock → SES → status) ─────────────────────────────────────

const truncate = (text) => String(text ?? '').slice(0, ERROR_MESSAGE_MAX)

async function sendOne(deps, item) {
  const { db, sendMail: send, now, env } = deps
  const { template, candidate, existingLog } = item
  const { user, group, scopeId } = candidate
  const { PK, SK } = keys.mailLog(user.id, template.id, scopeId)
  const createdAt = new Date(now).toISOString()

  const rendered = renderTemplate(template, buildVariables({ user, group }))

  // 1. Lock. The deterministic key makes a second concurrent run lose the race.
  if (!existingLog) {
    const won = await db.putItemIfAbsent({
      PK,
      SK,
      ...keys.mailLogGsi3(createdAt, user.id, template.id),
      id: `${template.id}:${user.id}:${scopeId}`,
      type: 'MAILLOG',
      templateId: template.id,
      userId: user.id,
      email: user.email,
      userName: user.name ?? '',
      groupId: group?.id ?? null,
      groupName: group?.name ?? null,
      subject: rendered.subject,
      status: 'sending',
      attempts: 1,
      errorMessage: null,
      sesMessageId: null,
      createdAt,
      sentAt: null,
    })
    if (!won) return 'skipped'
  } else {
    const seen = existingLog.attempts ?? 1
    const won = await db.updateItemIf(
      PK,
      SK,
      { status: 'sending', attempts: seen + 1, subject: rendered.subject },
      '#status = :expectedStatus AND #attempts = :seen',
      { ':expectedStatus': 'failed', ':seen': seen },
    )
    if (!won) return 'skipped'
  }

  // 2. Send.
  let messageId
  try {
    const html = wrapEmailHtml(rendered.bodyHtml, { replyToEmail: env.SES_REPLY_TO_EMAIL })
    ;({ messageId } = await send({ to: user.email, subject: rendered.subject, html }))
  } catch (err) {
    log('WARN', 'lifecycle-send-failed', { templateId: template.id, userId: user.id, message: err?.message })
    try {
      await db.updateItem(PK, SK, { status: 'failed', errorMessage: truncate(err?.message) })
    } catch (updateErr) {
      log('ERROR', 'lifecycle-log-update-failed', { templateId: template.id, userId: user.id, message: updateErr?.message })
    }
    return 'failed'
  }

  // 3. Record success. If only this write fails the row stays 'sending' — never
  // retried (at-most-once), so it can never turn into a duplicate.
  try {
    await db.updateItem(PK, SK, { status: 'sent', sentAt: new Date().toISOString(), sesMessageId: messageId ?? null, errorMessage: null })
  } catch (err) {
    log('ERROR', 'lifecycle-log-update-failed', { templateId: template.id, userId: user.id, message: err?.message })
  }
  return 'sent'
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

// ─── The run ─────────────────────────────────────────────────────────────────

/**
 * @param {{ dryRun?: boolean, force?: boolean }} event
 * @param {{ db: object, sendMail: Function, now: number, env: Record<string, string|undefined> }} deps
 */
export async function runLifecycle(event, deps) {
  const { db, now, env } = deps
  const dryRun = event?.dryRun === true
  const force = event?.force === true
  const at = new Date(now).toISOString()
  const masterEnabled = env.LIFECYCLE_MAIL_ENABLED === 'true'

  // 1. Master switch. LASTRUN is always written so the admin panel can show it.
  try {
    await db.putItem({ ...keys.mailState(), at, masterEnabled, dryRun })
  } catch (err) {
    log('WARN', 'lifecycle-lastrun-write-failed', { message: err?.message })
  }
  if (!masterEnabled && !dryRun) {
    const summary = { event: 'lifecycle-run', at, skipped: 'master-switch-off' }
    log('INFO', 'lifecycle-run', summary)
    return summary
  }
  if (!dryRun && (!env.SES_FROM_EMAIL || !env.SES_REPLY_TO_EMAIL)) {
    // Fail closed: without a monitored Reply-To the footer's promise would be a lie.
    log('ERROR', 'lifecycle-misconfigured', { message: 'SES_FROM_EMAIL and SES_REPLY_TO_EMAIL must both be set' })
    return { event: 'lifecycle-run', at, skipped: 'misconfigured' }
  }

  // 2. Send window (Amsterdam wall clock — the platform handles DST).
  const local = localParts(now)
  if (!force && !dryRun && local.hour !== SEND_HOUR) {
    const summary = { event: 'lifecycle-run', at, skipped: 'outside-send-window' }
    log('INFO', 'lifecycle-run', summary)
    return summary
  }
  if (WEEKEND.includes(local.weekday)) {
    const summary = { event: 'lifecycle-run', at, skipped: 'weekend' }
    log('INFO', 'lifecycle-run', summary)
    return summary
  }

  // 3. Templates + candidates.
  const configItems = await Promise.all(LIFECYCLE_TEMPLATES.map((def) => db.getItem(keys.mailTemplate(def.id).PK, 'CONFIG')))
  const templates = LIFECYCLE_TEMPLATES.map((def, index) => mergeTemplateConfig(def, configItems[index]))
  const configs = Object.fromEntries(templates.map((t) => [t.id, { enabledAt: t.enabledAt }]))
  const activeTiers = new Set(NORMAL_TIER_WEEKDAYS.includes(local.weekday) ? ['timely', 'normal'] : ['timely'])

  const ctx = createContext({
    now,
    db,
    maxCandidates: MAX_CANDIDATES_EVALUATED,
    warn: (message, extra) => log('WARN', message, extra),
    configs,
  })
  const cap = maxSendsPerRun(env)
  const picked = new Set()
  const sendList = []
  let evaluated = 0
  let skippedByCap = 0

  for (const template of templates) {
    if (!template.enabled || !activeTiers.has(template.tier)) continue
    for await (const candidate of EVALUATORS[template.id].candidates(ctx)) {
      evaluated += 1
      const decision = await decide(ctx, template, candidate, picked)
      if (!decision.send) continue
      picked.add(candidate.user.id) // one mail per user per run, even for those over the cap
      if (sendList.length >= cap) {
        skippedByCap += 1
        continue
      }
      sendList.push({ template, candidate, existingLog: decision.existingLog })
    }
  }

  // 4. Send (or, in a dry run, only report).
  let sent = 0
  let failed = 0
  const byTemplate = {}
  const tally = (templateId, key) => {
    byTemplate[templateId] ??= { sent: 0, failed: 0 }
    byTemplate[templateId][key] += 1
  }
  if (!dryRun) {
    const outcomes = await mapLimit(sendList, SEND_CONCURRENCY, (item) => sendOne(deps, item))
    outcomes.forEach((outcome, index) => {
      const templateId = sendList[index].template.id
      if (outcome === 'sent') {
        sent += 1
        tally(templateId, 'sent')
      } else if (outcome === 'failed') {
        failed += 1
        tally(templateId, 'failed')
      }
    })
  }

  // 5. Record + report.
  try {
    await db.updateItem(keys.mailState().PK, keys.mailState().SK, { evaluated, sent, failed, skippedByCap })
  } catch (err) {
    log('WARN', 'lifecycle-lastrun-write-failed', { message: err?.message })
  }
  const summary = { event: 'lifecycle-run', at, dryRun, force, evaluated, sent, failed, skippedByCap, byTemplate }
  if (dryRun) {
    summary.wouldSend = sendList.map(({ template, candidate }) => ({
      templateId: template.id,
      userId: candidate.user.id,
      scopeId: candidate.scopeId,
    }))
  }
  log('INFO', 'lifecycle-run', summary)
  return summary
}

export async function handler(event = {}) {
  try {
    return await runLifecycle(event, { db: realDb, sendMail, now: Date.now(), env: process.env })
  } catch (err) {
    // Rethrow so the invocation shows up as an error (CloudWatch alarm); the run is
    // idempotent, so the next scheduled slot simply picks up whatever is left.
    log('ERROR', 'lifecycle-run-failed', { message: err?.message, stack: err?.stack })
    throw err
  }
}
