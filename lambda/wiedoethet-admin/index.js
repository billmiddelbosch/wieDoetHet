/**
 * Admin Lambda — handles:
 *   GET /admin/stats
 *   GET /admin/users
 *   GET /admin/users/{userId}
 *   GET /admin/groups
 *   GET /admin/groups/{groupId}
 *
 * Function name: wiedoethet-admin
 * Runtime: nodejs24.x
 * Handler: index.handler
 *
 * Read-only, role-gated (User.role === 'admin', re-checked server-side on every
 * request — the JWT itself carries no role claim). See
 * product/specs/admin-api.spec.md for the full contract.
 */

import { ok, unauthorized, forbidden, notFound, badRequest, serverError, extractBearer } from '../shared/http.js'
import { verifyJwt } from '../shared/jwt.js'
import { getItem, queryByPk, queryGsi1, queryGsi2, queryGsi3 } from '../shared/db.js'

const MAX_INTERNAL_QUERIES = 5

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

  const { items: rawUsers, nextCursor } = await queryGsi3Paginated('USER', {
    limit,
    exclusiveStartKey,
    filterExpression: q ? 'contains(email, :q) OR contains(#name, :q)' : undefined,
    expressionAttributeNames: q ? { '#name': 'name' } : undefined,
    expressionAttributeValues: q ? { ':q': q } : undefined,
  })

  const items = await Promise.all(rawUsers.map((u) => enrichUserSummary(u)))

  logSuccess({ route: 'GET /admin/users', adminUserId: admin.id, start, resultCount: items.length })
  return ok({ items, nextCursor })
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

  const detail = { ...toUserSummaryBase(user), groupCount, lastActivityAt, groups }

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

// ─── Read-model builders ─────────────────────────────────────────────────────

function toUserSummaryBase(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role ?? 'user',
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
async function queryGsi3Paginated(gsi3pk, { limit, exclusiveStartKey, filterExpression, expressionAttributeNames, expressionAttributeValues }) {
  const items = []
  let cursor = exclusiveStartKey
  let lastEvaluatedKey = null

  for (let loop = 0; loop < MAX_INTERNAL_QUERIES && items.length < limit; loop++) {
    const result = await queryGsi3(gsi3pk, {
      scanIndexForward: false,
      limit,
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

    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Route niet gevonden' }) }
  } catch (err) {
    return serverError(err)
  }
}
