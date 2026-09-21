/**
 * Admin Lambda — handles:
 *   GET  /admin/stats
 *   GET  /admin/users
 *   GET  /admin/users/{userId}
 *   GET  /admin/groups
 *   GET  /admin/groups/{groupId}
 *   POST /admin/mail
 *   GET  /admin/mail-templates
 *   PATCH /admin/mail-master
 *   PATCH /admin/mail-templates/{templateId}
 *   POST /admin/mail-templates/{templateId}/test
 *   GET  /admin/mail-log
 *   PATCH /admin/users/{userId}/mail-opt-out
 *
 * Function name: wiedoethet-admin
 * Runtime: nodejs24.x
 * Handler: index.handler
 *
 * Role-gated (User.role === 'admin', re-checked server-side on every request —
 * the JWT itself carries no role claim). All GET routes are read-only. POST
 * /admin/mail and POST /admin/mail-templates/{id}/test send email via SES;
 * PATCH /admin/mail-templates/{id}, PATCH /admin/mail-master and
 * PATCH /admin/users/{id}/mail-opt-out write to DynamoDB. See product/specs/admin-api.spec.md and
 * product/specs/mail-automation-api.spec.md for the full contracts, and
 * lambda/SES_SETUP.md for the SES setup the mail routes depend on.
 */

import { ok, unauthorized, forbidden, notFound, badRequest, badGateway, serverError, extractBearer, parseBody } from '../shared/http.js'
import { verifyJwt } from '../shared/jwt.js'
import { getItem, updateItem, queryByPk, queryGsi1, queryGsi2, queryGsi3, keys } from '../shared/db.js'
import { sendMail } from '../shared/ses.js'
import { wrapEmailHtml } from '../shared/email-template.js'
import { LIFECYCLE_TEMPLATES, getTemplate, mergeTemplateConfig } from '../shared/lifecycle-templates.js'
import { validateTemplateText, buildVariables, renderTemplate, getAppUrl } from '../shared/mail-render.js'

const MAX_INTERNAL_QUERIES = 5
const MAX_MAIL_RESOLVE_QUERIES = 200 // safety cap on the resolveAllMatchingUsers loop (~10,000 users at page size 50)
const MAX_MAIL_RECIPIENTS = 500 // safety cap on a single /admin/mail send — keeps Lambda duration and SES throughput bounded
const MAIL_SEND_CONCURRENCY = 5

// ─── Route handlers ──────────────────────────────────────────────────────────

async function getStats(event) {
  const start = Date.now()
  const { user: admin, error } = await requireAdmin(event)
  if (error) return error

  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [totalUsers, totalGroups, newUsers, newGroups, recentUsersRaw, recentGroupsRaw] = await Promise.all([
    queryGsi3('USER', { select: 'COUNT' }),
    queryGsi3('GROUP', { select: 'COUNT' }),
    queryGsi3('USER', { skGte: sevenDaysAgoIso, select: 'COUNT' }),
    queryGsi3('GROUP', { skGte: sevenDaysAgoIso, select: 'COUNT' }),
    queryGsi3('USER', { scanIndexForward: false, limit: 5 }),
    queryGsi3('GROUP', { scanIndexForward: false, limit: 5 }),
  ])

  const [recentUsers, recentGroups] = await Promise.all([
    Promise.all(recentUsersRaw.items.map((u) => enrichUserSummary(u))),
    Promise.all(recentGroupsRaw.items.map(async (g) => {
      const initiator = await getItem(`USER#${g.initiatorId}`, 'PROFILE')
      return enrichGroupSummary(g, initiator)
    })),
  ])

  const stats = {
    totalUsers: totalUsers.count,
    totalGroups: totalGroups.count,
    newUsersLast7d: newUsers.count,
    newGroupsLast7d: newGroups.count,
    recentUsers,
    recentGroups,
    generatedAt: new Date().toISOString(),
  }

  logSuccess({ route: 'GET /admin/stats', adminUserId: admin.id, start, resultCount: recentUsers.length + recentGroups.length })
  return ok(stats)
}

async function listUsers(event) {
  const start = Date.now()
  const { user: admin, error } = await requireAdmin(event)
  if (error) return error

  const params = parseListParams(event)
  if (params.error) return params.error
  const { limit, exclusiveStartKey, q } = params

  const filterExpression = q ? 'contains(email, :q) OR contains(#name, :q)' : undefined
  const expressionAttributeNames = q ? { '#name': 'name' } : undefined
  const expressionAttributeValues = q ? { ':q': q } : undefined

  const [{ items: rawUsers, nextCursor }, totalCount] = await Promise.all([
    queryGsi3Paginated('USER', { limit, exclusiveStartKey, filterExpression, expressionAttributeNames, expressionAttributeValues }),
    countAllMatchingUsers(q),
  ])

  const items = await Promise.all(rawUsers.map((u) => enrichUserSummary(u)))

  logSuccess({ route: 'GET /admin/users', adminUserId: admin.id, start, resultCount: items.length })
  return ok({ items, nextCursor, totalCount })
}

/**
 * Total count of users matching q, across the WHOLE partition (not just one
 * page) — powers "select all N matching filter" in the admin UI. Select:
 * 'COUNT' still applies FilterExpression after reading `limit` items per
 * internal page, same gotcha as queryGsi3Paginated, so this loops the same
 * way rather than trusting a single query's Count.
 */
async function countAllMatchingUsers(q) {
  if (!q) {
    const result = await queryGsi3('USER', { select: 'COUNT' })
    return result.count
  }
  let total = 0
  let exclusiveStartKey
  for (let loop = 0; loop < MAX_MAIL_RESOLVE_QUERIES; loop++) {
    const result = await queryGsi3('USER', {
      limit: 50,
      exclusiveStartKey,
      filterExpression: 'contains(email, :q) OR contains(#name, :q)',
      expressionAttributeNames: { '#name': 'name' },
      expressionAttributeValues: { ':q': q },
    })
    total += result.items.length
    if (!result.lastEvaluatedKey) break
    exclusiveStartKey = result.lastEvaluatedKey
  }
  return total
}

/**
 * POST /admin/mail — compose and send an HTML email to one or many users.
 *
 * Two ways to pick recipients:
 *  - `userIds: string[]` — explicit list (from the checkboxes the admin ticked
 *    on the current page).
 *  - `selectAll: true` (+ optional `q`) — "select all N matching the current
 *    filter". We NEVER trust a client-supplied bulk list for this case; we
 *    re-run listUsers' own filter server-side (resolveAllMatchingUsers) so the
 *    recipient set always matches what the admin actually searched for, not
 *    whatever the client happened to send.
 *
 * Sends are per-recipient (not one BCC'd SES call — SES's own per-recipient
 * bounce/complaint tracking works properly this way), in small bounded-
 * concurrency chunks. An individual send failure is not fatal to the request;
 * failures are collected and returned alongside the success count.
 *
 * Users with `mailOptOut === true` are never mailed: they are dropped after
 * recipient resolution and before the MAX_MAIL_RECIPIENTS check (which applies
 * to the sendable set), and reported back as `skippedOptOut`. Every mail goes
 * through wrapEmailHtml, whose footer needs SES_REPLY_TO_EMAIL.
 */
async function mailUsers(event) {
  const start = Date.now()
  const { user: admin, error } = await requireAdmin(event)
  if (error) return error

  const body = parseBody(event)
  const subject = body.subject?.trim()
  const html = body.html?.trim()
  if (!subject) return badRequest('Onderwerp is verplicht')
  if (!html) return badRequest('Berichttekst is verplicht')
  if (!process.env.SES_REPLY_TO_EMAIL) return serverError(new Error('SES_REPLY_TO_EMAIL env var is not set'))

  let recipients
  if (body.selectAll === true) {
    const q = typeof body.q === 'string' ? body.q.trim() || undefined : undefined
    recipients = await resolveAllMatchingUsers(q)
  } else {
    if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
      return badRequest('userIds is verplicht (of selectAll: true)')
    }
    const uniqueIds = [...new Set(body.userIds)]
    const found = await Promise.all(uniqueIds.map((id) => getItem(`USER#${id}`, 'PROFILE')))
    recipients = found.filter(Boolean)
  }

  if (recipients.length === 0) return badRequest('Geen ontvangers gevonden')

  const sendable = recipients.filter((user) => user.mailOptOut !== true)
  const skippedOptOut = recipients.length - sendable.length
  if (sendable.length === 0) {
    logSuccess({ route: 'POST /admin/mail', adminUserId: admin.id, start, resultCount: 0 })
    return ok({ sent: 0, failed: 0, failures: [], skippedOptOut })
  }
  if (sendable.length > MAX_MAIL_RECIPIENTS) {
    return badRequest(`Te veel ontvangers (${sendable.length}). Maximum is ${MAX_MAIL_RECIPIENTS} per verzending.`)
  }

  const { sent, failed, failures } = await sendToRecipients(sendable, subject, wrapEmailHtml(html))

  logSuccess({ route: 'POST /admin/mail', adminUserId: admin.id, start, resultCount: sent })
  return ok({ sent, failed, failures, skippedOptOut })
}

/**
 * Re-runs listUsers' own email/name filter against the full GSI3 'USER'
 * partition, unpaged, to resolve "select all N matching current filter"
 * server-side. Bounded by MAX_MAIL_RESOLVE_QUERIES as a sanity cap — a real
 * DynamoDB partition always terminates via a null LastEvaluatedKey well
 * before that.
 */
async function resolveAllMatchingUsers(q) {
  const users = []
  let exclusiveStartKey
  for (let loop = 0; loop < MAX_MAIL_RESOLVE_QUERIES; loop++) {
    const result = await queryGsi3('USER', {
      limit: 50,
      exclusiveStartKey,
      filterExpression: q ? 'contains(email, :q) OR contains(#name, :q)' : undefined,
      expressionAttributeNames: q ? { '#name': 'name' } : undefined,
      expressionAttributeValues: q ? { ':q': q } : undefined,
    })
    users.push(...result.items)
    if (!result.lastEvaluatedKey) break
    exclusiveStartKey = result.lastEvaluatedKey
  }
  return users
}

/** Sends one email per recipient in small concurrent chunks; failures are non-fatal. */
async function sendToRecipients(recipients, subject, html) {
  let sent = 0
  const failures = []
  for (let i = 0; i < recipients.length; i += MAIL_SEND_CONCURRENCY) {
    const chunk = recipients.slice(i, i + MAIL_SEND_CONCURRENCY)
    const results = await Promise.all(chunk.map(async (user) => {
      try {
        await sendMail({ to: user.email, subject, html })
        return { ok: true }
      } catch (err) {
        return { ok: false, userId: user.id, email: user.email, message: err.message }
      }
    }))
    for (const result of results) {
      if (result.ok) sent++
      else failures.push({ userId: result.userId, email: result.email, message: result.message })
    }
  }
  return { sent, failed: failures.length, failures }
}

async function getUserDetail(event) {
  const start = Date.now()
  const { user: admin, error } = await requireAdmin(event)
  if (error) return error

  const { userId } = event.pathParameters ?? {}
  const user = await getItem(`USER#${userId}`, 'PROFILE')
  if (!user) return notFound('Gebruiker niet gevonden')

  const groupItems = (await queryGsi2(`INITIATOR#${userId}`, 'GROUP#')).filter((g) => g.SK === 'METADATA')
  const groupCount = groupItems.length
  const mostRecentGroupCreatedAt = groupItems.reduce((max, g) => (g.createdAt > max ? g.createdAt : max), '')
  const lastActivityAt = mostRecentGroupCreatedAt > user.createdAt ? mostRecentGroupCreatedAt : user.createdAt
  const groups = groupItems
    .map((g) => ({ id: g.id, name: g.name, shareToken: g.shareToken, createdAt: g.createdAt }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const detail = {
    ...toUserSummaryBase(user),
    mailOptOutAt: user.mailOptOutAt ?? null,
    lastSeenAt: user.lastSeenAt ?? null,
    groupCount,
    lastActivityAt,
    groups,
  }

  logSuccess({ route: 'GET /admin/users/{userId}', adminUserId: admin.id, start, resultCount: 1 })
  return ok(detail)
}

async function listGroups(event) {
  const start = Date.now()
  const { user: admin, error } = await requireAdmin(event)
  if (error) return error

  const params = parseListParams(event)
  if (params.error) return params.error
  const { limit, exclusiveStartKey, q } = params

  const { items: rawGroups, nextCursor } = await queryGsi3Paginated('GROUP', {
    limit,
    exclusiveStartKey,
    filterExpression: q ? 'contains(#name, :q)' : undefined,
    expressionAttributeNames: q ? { '#name': 'name' } : undefined,
    expressionAttributeValues: q ? { ':q': q } : undefined,
  })

  // Dedupe initiator lookups across the page (bounded by page size <= 50, not a full-table op)
  const uniqueInitiatorIds = [...new Set(rawGroups.map((g) => g.initiatorId))]
  const initiatorRecords = await Promise.all(uniqueInitiatorIds.map((id) => getItem(`USER#${id}`, 'PROFILE')))
  const initiatorMap = new Map(initiatorRecords.filter(Boolean).map((u) => [u.id, u]))

  const items = await Promise.all(rawGroups.map((g) => enrichGroupSummary(g, initiatorMap.get(g.initiatorId))))

  logSuccess({ route: 'GET /admin/groups', adminUserId: admin.id, start, resultCount: items.length })
  return ok({ items, nextCursor })
}

async function getGroupDetail(event) {
  const start = Date.now()
  const { user: admin, error } = await requireAdmin(event)
  if (error) return error

  const { groupId } = event.pathParameters ?? {}
  const group = await getItem(`GROUP#${groupId}`, 'METADATA')
  if (!group) return notFound('Groep niet gevonden')

  const [initiator, tasks, claims] = await Promise.all([
    getItem(`USER#${group.initiatorId}`, 'PROFILE'),
    queryByPk(`GROUP#${groupId}`, 'TASK#'),
    queryGsi1(`GCLAIM#${groupId}`),
  ])

  // Claims fetched once, grouped by taskId in memory — not one claims query per task
  const claimsByTask = new Map()
  for (const c of claims) {
    if (!claimsByTask.has(c.taskId)) claimsByTask.set(c.taskId, [])
    claimsByTask.get(c.taskId).push(c)
  }
  const uniqueClaimers = new Set(claims.map((c) => c.userId ?? c.sessionId))

  // Resolve claimant display names — same convention as wiedoethet-claims' listClaims
  const userIds = [...new Set(claims.map((c) => c.userId).filter(Boolean))]
  const userRecords = await Promise.all(userIds.map((uid) => getItem(`USER#${uid}`, 'PROFILE')))
  const userMap = Object.fromEntries(userRecords.filter(Boolean).map((u) => [u.id, u.name]))
  const claimerName = (c) => (c.userId ? (userMap[c.userId] ?? 'Onbekend') : c.anonymousName ?? 'Anoniem')

  const taskList = tasks
    .map((t) => {
      const taskClaims = claimsByTask.get(t.id) ?? []
      return {
        id: t.id,
        title: t.title,
        order: t.order,
        claimCount: taskClaims.length,
        claimedBy: taskClaims.length ? taskClaims.map(claimerName).join(', ') : null,
      }
    })
    .sort((a, b) => a.order - b.order)

  const detail = {
    ...toGroupSummaryBase(group, initiator),
    taskCount: tasks.length,
    memberCount: uniqueClaimers.size,
    tasks: taskList,
  }

  logSuccess({ route: 'GET /admin/groups/{groupId}', adminUserId: admin.id, start, resultCount: 1 })
  return ok(detail)
}

// ─── Mail automation (templates, log, opt-out) ───────────────────────────────

const MAIL_LOG_STATUSES = ['sent', 'failed', 'sending']
const MAIL_LOG_PAGE_SIZE = 100 // DynamoDB read size when a filter is active — FilterExpression applies after the read
const MAIL_LOG_MAX_QUERIES = 20

/** One `items[]` entry of GET /admin/mail-templates (static definition merged with its CONFIG item). */
function toTemplateItem(definition, config) {
  const merged = mergeTemplateConfig(definition, config)
  return {
    id: merged.id,
    scope: merged.scope,
    tier: merged.tier,
    enabled: merged.enabled,
    subject: merged.subject,
    bodyHtml: merged.bodyHtml,
    defaultSubject: merged.defaultSubject,
    defaultBodyHtml: merged.defaultBodyHtml,
    isCustomised: merged.isCustomised,
    variables: merged.variables,
    updatedAt: merged.updatedAt,
    updatedBy: merged.updatedBy,
  }
}

async function getTemplateConfig(templateId) {
  const { PK, SK } = keys.mailTemplate(templateId)
  return getItem(PK, SK)
}

async function listMailTemplates(event) {
  const start = Date.now()
  const { user: admin, error } = await requireAdmin(event)
  if (error) return error

  const state = keys.mailState()
  const [configs, lastRunItem, masterItem] = await Promise.all([
    Promise.all(LIFECYCLE_TEMPLATES.map((t) => getTemplateConfig(t.id))),
    getItem(state.PK, state.SK),
    getMailMasterItem(),
  ])

  const items = LIFECYCLE_TEMPLATES.map((definition, i) => toTemplateItem(definition, configs[i]))
  const lastRun = lastRunItem
    ? {
        at: lastRunItem.at,
        masterEnabled: lastRunItem.masterEnabled === true,
        killSwitch: lastRunItem.killSwitch === true,
        dryRun: lastRunItem.dryRun === true,
        evaluated: lastRunItem.evaluated ?? 0,
        sent: lastRunItem.sent ?? 0,
        failed: lastRunItem.failed ?? 0,
        skippedByCap: lastRunItem.skippedByCap ?? 0,
      }
    : null

  logSuccess({ route: 'GET /admin/mail-templates', adminUserId: admin.id, start, resultCount: items.length })
  return ok({ items, lastRun, master: toMasterItem(masterItem) })
}

async function getMailMasterItem() {
  const { PK, SK } = keys.mailMaster()
  return getItem(PK, SK)
}

/** No MASTER item means the switch was never turned on: off, like the lifecycle Lambda treats it. */
function toMasterItem(item) {
  return {
    enabled: item?.enabled === true,
    updatedAt: item?.updatedAt ?? null,
    updatedBy: item?.updatedBy ?? null,
  }
}

/** The lifecycle mail master switch. The lifecycle Lambda reads this item on every run. */
async function setMailMaster(event) {
  const start = Date.now()
  const { user: admin, error } = await requireAdmin(event)
  if (error) return error

  const body = parseBody(event)
  if (typeof body.enabled !== 'boolean') return badRequest('enabled moet true of false zijn')

  const { PK, SK } = keys.mailMaster()
  const next = { enabled: body.enabled, updatedAt: new Date().toISOString(), updatedBy: admin.id }
  await updateItem(PK, SK, next)

  logSuccess({ route: 'PATCH /admin/mail-master', adminUserId: admin.id, start, resultCount: 1 })
  return ok(toMasterItem(next))
}

async function updateMailTemplate(event) {
  const start = Date.now()
  const { user: admin, error } = await requireAdmin(event)
  if (error) return error

  const { templateId } = event.pathParameters ?? {}
  const definition = getTemplate(templateId)
  if (!definition) return notFound('Sjabloon niet gevonden')

  const body = parseBody(event)
  const has = (field) => Object.prototype.hasOwnProperty.call(body, field)
  if (!has('enabled') && !has('subject') && !has('bodyHtml')) return badRequest('Geen wijzigingen opgegeven')
  if (has('enabled') && typeof body.enabled !== 'boolean') return badRequest('enabled moet true of false zijn')

  const validationError = validateTemplateText({ subject: body.subject, bodyHtml: body.bodyHtml }, definition.variables)
  if (validationError) return badRequest(validationError)

  const { PK, SK } = keys.mailTemplate(templateId)
  const existing = await getItem(PK, SK)
  const now = new Date().toISOString()

  const enabled = has('enabled') ? body.enabled : existing?.enabled === true
  const next = {
    enabled,
    // null clears the override (back to the default text); admin HTML is stored as-is
    subject: has('subject') ? (typeof body.subject === 'string' ? body.subject.trim() : null) : (existing?.subject ?? null),
    bodyHtml: has('bodyHtml') ? (typeof body.bodyHtml === 'string' ? body.bodyHtml : null) : (existing?.bodyHtml ?? null),
    // false -> true restarts the clock the dormant_* templates measure from; true -> false leaves it
    enabledAt: enabled && existing?.enabled !== true ? now : (existing?.enabledAt ?? null),
    updatedAt: now,
    updatedBy: admin.id,
  }
  await updateItem(PK, SK, next)

  logSuccess({ route: 'PATCH /admin/mail-templates/{templateId}', adminUserId: admin.id, start, resultCount: 1 })
  return ok(toTemplateItem(definition, next))
}

/** Renders the template with sample values and mails it to the calling admin only. Not logged. */
async function sendTemplateTest(event) {
  const start = Date.now()
  const { user: admin, error } = await requireAdmin(event)
  if (error) return error

  const { templateId } = event.pathParameters ?? {}
  const definition = getTemplate(templateId)
  if (!definition) return notFound('Sjabloon niet gevonden')

  const merged = mergeTemplateConfig(definition, await getTemplateConfig(templateId))
  const values = buildVariables({
    user: admin,
    group: definition.scope === 'group' ? { id: 'voorbeeld', name: 'Voorbeeldgroep' } : undefined,
  })
  // A sample group has no page of its own; point at a real one instead of a dead link
  if (definition.scope === 'group') values.groupUrl = `${getAppUrl()}/dashboard`
  const rendered = renderTemplate({ subject: merged.subject, bodyHtml: merged.bodyHtml }, values)

  try {
    await sendMail({ to: admin.email, subject: `[TEST] ${rendered.subject}`, html: wrapEmailHtml(rendered.bodyHtml) })
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', route: 'POST /admin/mail-templates/{templateId}/test', message: err.message }))
    return badGateway(`Testmail versturen mislukt: ${err.message}`)
  }

  logSuccess({ route: 'POST /admin/mail-templates/{templateId}/test', adminUserId: admin.id, start, resultCount: 1 })
  return ok({ sent: true, to: admin.email })
}

async function listMailLog(event) {
  const start = Date.now()
  const { user: admin, error } = await requireAdmin(event)
  if (error) return error

  const params = parseListParams(event)
  if (params.error) return params.error
  const { limit, exclusiveStartKey, q } = params

  const qs = event.queryStringParameters ?? {}
  const templateId = qs.templateId || undefined
  const status = qs.status || undefined
  if (templateId && !getTemplate(templateId)) return badRequest('Onbekend sjabloon')
  if (status && !MAIL_LOG_STATUSES.includes(status)) return badRequest('Ongeldige status')

  const conditions = []
  const expressionAttributeNames = {}
  const expressionAttributeValues = {}
  if (templateId) {
    conditions.push('templateId = :templateId')
    expressionAttributeValues[':templateId'] = templateId
  }
  if (status) {
    conditions.push('#status = :status')
    expressionAttributeNames['#status'] = 'status'
    expressionAttributeValues[':status'] = status
  }
  if (q) {
    // Emails are stored lower-case (register lower-cases them), so lower-casing the needle makes this case-insensitive
    conditions.push('contains(email, :q)')
    expressionAttributeValues[':q'] = q.toLowerCase()
  }
  const filtered = conditions.length > 0

  const { items: rows, nextCursor } = await queryGsi3Paginated('MAILLOG', {
    limit,
    exclusiveStartKey,
    pageSize: filtered ? MAIL_LOG_PAGE_SIZE : limit,
    maxQueries: filtered ? MAIL_LOG_MAX_QUERIES : MAX_INTERNAL_QUERIES,
    filterExpression: filtered ? conditions.join(' AND ') : undefined,
    expressionAttributeNames: Object.keys(expressionAttributeNames).length ? expressionAttributeNames : undefined,
    expressionAttributeValues: filtered ? expressionAttributeValues : undefined,
  })

  const items = rows.map((row) => {
    // eslint-disable-next-line no-unused-vars
    const { PK, SK, GSI3PK, GSI3SK, type, ...entry } = row
    return entry
  })

  logSuccess({ route: 'GET /admin/mail-log', adminUserId: admin.id, start, resultCount: items.length })
  return ok({ items, nextCursor })
}

async function setUserMailOptOut(event) {
  const start = Date.now()
  const { user: admin, error } = await requireAdmin(event)
  if (error) return error

  const { userId } = event.pathParameters ?? {}
  const { optOut } = parseBody(event)
  if (typeof optOut !== 'boolean') return badRequest('optOut moet true of false zijn')

  const user = await getItem(`USER#${userId}`, 'PROFILE')
  if (!user) return notFound('Gebruiker niet gevonden')

  // Idempotent: repeating the current state changes nothing (keeps the original mailOptOutAt)
  const current = user.mailOptOut === true
  if (optOut === current) {
    logSuccess({ route: 'PATCH /admin/users/{userId}/mail-opt-out', adminUserId: admin.id, start, resultCount: 1 })
    return ok({ id: user.id, mailOptOut: current, mailOptOutAt: current ? (user.mailOptOutAt ?? null) : null })
  }

  const mailOptOutAt = optOut ? new Date().toISOString() : null
  await updateItem(`USER#${userId}`, 'PROFILE', { mailOptOut: optOut, mailOptOutAt, mailOptOutBy: admin.id })

  logSuccess({ route: 'PATCH /admin/users/{userId}/mail-opt-out', adminUserId: admin.id, start, resultCount: 1 })
  return ok({ id: user.id, mailOptOut: optOut, mailOptOutAt })
}

// ─── Read-model builders ─────────────────────────────────────────────────────

function toUserSummaryBase(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role ?? 'user',
    mailOptOut: user.mailOptOut === true,
    createdAt: user.createdAt,
  }
}

async function enrichUserSummary(user) {
  const groups = (await queryGsi2(`INITIATOR#${user.id}`, 'GROUP#')).filter((g) => g.SK === 'METADATA')
  const mostRecentGroupCreatedAt = groups.reduce((max, g) => (g.createdAt > max ? g.createdAt : max), '')
  const lastActivityAt = mostRecentGroupCreatedAt > user.createdAt ? mostRecentGroupCreatedAt : user.createdAt
  return { ...toUserSummaryBase(user), groupCount: groups.length, lastActivityAt }
}

function toGroupSummaryBase(group, initiator) {
  return {
    id: group.id,
    name: group.name,
    pictureUrl: group.pictureUrl ?? null,
    shareToken: group.shareToken,
    scorecardVisibility: group.scorecardVisibility,
    initiatorId: group.initiatorId,
    initiatorName: initiator?.name ?? 'Onbekend',
    initiatorEmail: initiator?.email ?? '',
    createdAt: group.createdAt,
  }
}

async function enrichGroupSummary(group, initiator) {
  const [tasks, claims] = await Promise.all([
    queryByPk(`GROUP#${group.id}`, 'TASK#'),
    queryGsi1(`GCLAIM#${group.id}`),
  ])
  const uniqueClaimers = new Set(claims.map((c) => c.userId ?? c.sessionId))
  return { ...toGroupSummaryBase(group, initiator), taskCount: tasks.length, memberCount: uniqueClaimers.size }
}

// ─── Pagination helpers ──────────────────────────────────────────────────────

/**
 * Bounded internal-retry loop around queryGsi3 for filtered/paginated listings.
 *
 * FilterExpression is applied by DynamoDB AFTER it reads `limit` items from the
 * index, so a single filtered query can under-fill a page even though more
 * matches exist further in the index. We loop (capped at MAX_INTERNAL_QUERIES)
 * accumulating filtered results until either `limit` items are collected or
 * DynamoDB's own lastEvaluatedKey goes null.
 *
 * Cursor for the next page:
 *  - If this call's accumulated items overshoot `limit` (a filtered batch can
 *    return in total more than `limit` across loop iterations), the raw
 *    DynamoDB LastEvaluatedKey from the final internal call does NOT line up
 *    with the client-facing trimmed result — it reflects where the raw scan
 *    stopped, not where we stopped returning items. In that case we synthesize
 *    the next cursor directly from the last *returned* item's own key
 *    attributes (present on every item since GSI3 projects all attributes).
 *  - Otherwise DynamoDB's own lastEvaluatedKey is used directly (this is also
 *    the only path taken when `q` is not supplied, since an unfiltered query
 *    can never accumulate more than one call's `limit`).
 */
async function queryGsi3Paginated(gsi3pk, {
  limit,
  exclusiveStartKey,
  filterExpression,
  expressionAttributeNames,
  expressionAttributeValues,
  pageSize = limit, // DynamoDB read size per internal query; raise it for sparse filters
  maxQueries = MAX_INTERNAL_QUERIES,
}) {
  const items = []
  let cursor = exclusiveStartKey
  let lastEvaluatedKey = null

  for (let loop = 0; loop < maxQueries && items.length < limit; loop++) {
    const result = await queryGsi3(gsi3pk, {
      scanIndexForward: false,
      limit: pageSize,
      exclusiveStartKey: cursor,
      filterExpression,
      expressionAttributeNames,
      expressionAttributeValues,
    })
    items.push(...result.items)
    lastEvaluatedKey = result.lastEvaluatedKey
    cursor = result.lastEvaluatedKey ?? undefined
    if (!result.lastEvaluatedKey) break
  }

  if (items.length > limit) {
    const trimmed = items.slice(0, limit)
    const lastReturned = trimmed[trimmed.length - 1]
    return { items: trimmed, nextCursor: encodeCursor(exclusiveStartKeyFromItem(lastReturned)) }
  }

  return { items, nextCursor: lastEvaluatedKey ? encodeCursor(lastEvaluatedKey) : null }
}

function exclusiveStartKeyFromItem(item) {
  return { PK: item.PK, SK: item.SK, GSI3PK: item.GSI3PK, GSI3SK: item.GSI3SK }
}

function encodeCursor(lastEvaluatedKey) {
  return lastEvaluatedKey ? Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64url') : null
}

function decodeCursor(cursor) {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    return undefined // triggers 400
  }
}

function parseListParams(event) {
  const qs = event.queryStringParameters ?? {}

  let limit = 20
  if (qs.limit !== undefined && qs.limit !== '') {
    const n = Number(qs.limit)
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      return { error: badRequest('limit moet een geheel getal tussen 1 en 50 zijn') }
    }
    limit = n
  }

  let exclusiveStartKey
  if (qs.cursor) {
    exclusiveStartKey = decodeCursor(qs.cursor)
    if (exclusiveStartKey === undefined) return { error: badRequest('Ongeldige cursor') }
  }

  const q = qs.q?.trim() || undefined

  return { limit, exclusiveStartKey, q }
}

// ─── Auth & logging ──────────────────────────────────────────────────────────

/**
 * Async (unlike wiedoethet-groups'/wiedoethet-auth's synchronous requireAuth):
 * the JWT carries no role claim, so every admin request re-fetches the
 * caller's User record to check role. Returns a discriminated result so
 * callers can distinguish 401 (no/invalid/expired token, or token's sub no
 * longer resolves to a User) from 403 (resolves, but role !== 'admin').
 */
async function requireAdmin(event) {
  const token = extractBearer(event)
  if (!token) return { error: unauthorized() }

  let payload
  try {
    payload = verifyJwt(token)
  } catch {
    return { error: unauthorized() }
  }

  const user = await getItem(`USER#${payload.sub}`, 'PROFILE')
  if (!user) return { error: unauthorized() }
  if (user.role !== 'admin') return { error: forbidden() }

  return { user }
}

function logSuccess({ route, adminUserId, start, resultCount }) {
  console.log(JSON.stringify({
    level: 'info',
    route,
    adminUserId,
    durationMs: Date.now() - start,
    resultCount,
  }))
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  process.env.TABLE_NAME = event.stageVariables?.tableName ?? process.env.TABLE_NAME ?? 'wdh-main'
  try {
    const method = event.httpMethod
    const path = event.path?.replace(/\/$/, '')

    if (method === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS' }, body: '' }

    if (method === 'GET' && path === '/admin/stats')               return await getStats(event)
    if (method === 'GET' && path === '/admin/users')                return await listUsers(event)
    if (method === 'GET' && /^\/admin\/users\/[^/]+$/.test(path))   return await getUserDetail(event)
    if (method === 'GET' && path === '/admin/groups')                return await listGroups(event)
    if (method === 'GET' && /^\/admin\/groups\/[^/]+$/.test(path))  return await getGroupDetail(event)
    if (method === 'POST' && path === '/admin/mail')                 return await mailUsers(event)
    if (method === 'GET' && path === '/admin/mail-templates')        return await listMailTemplates(event)
    if (method === 'PATCH' && path === '/admin/mail-master')         return await setMailMaster(event)
    if (method === 'PATCH' && /^\/admin\/mail-templates\/[^/]+$/.test(path))     return await updateMailTemplate(event)
    if (method === 'POST' && /^\/admin\/mail-templates\/[^/]+\/test$/.test(path)) return await sendTemplateTest(event)
    if (method === 'GET' && path === '/admin/mail-log')              return await listMailLog(event)
    if (method === 'PATCH' && /^\/admin\/users\/[^/]+\/mail-opt-out$/.test(path)) return await setUserMailOptOut(event)

    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Route niet gevonden' }) }
  } catch (err) {
    return serverError(err)
  }
}
