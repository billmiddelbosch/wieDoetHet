/**
 * Groups Lambda — handles:
 *   GET    /groups
 *   POST   /groups
 *   GET    /groups/share/{shareToken}
 *   GET    /groups/{id}
 *   PATCH  /groups/{id}
 *   DELETE /groups/{id}
 *
 * Function name: wiedoethet-groups
 * Runtime: nodejs24.x
 * Handler: index.handler
 */

import { randomUUID } from 'node:crypto'
import { ok, created, noContent, unauthorized, forbidden, notFound, badRequest, serverError, parseBody, extractBearer } from '../shared/http.js'
import { verifyJwt } from '../shared/jwt.js'
import { getItem, putItem, deleteItem, queryGsi1, queryGsi2, keys } from '../shared/db.js'

// ─── Route handlers ──────────────────────────────────────────────────────────

async function listGroups(event) {
  const user = requireAuth(event)
  if (!user) return unauthorized()

  const items = await queryGsi2(`INITIATOR#${user.sub}`, 'GROUP#')
  // Each GSI2 item IS the group record; sort by createdAt descending
  const groups = items
    .filter((i) => i.SK === 'METADATA')
    .map(stripKeys)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return ok(groups)
}

async function createGroup(event) {
  const user = requireAuth(event)
  if (!user) return unauthorized()

  const body = parseBody(event)
  if (!body.name?.trim()) return badRequest('Naam is verplicht')

  const id = randomUUID()
  const shareToken = `tok-${randomUUID().slice(0, 8)}`
  const now = new Date().toISOString()

  const group = {
    PK: `GROUP#${id}`,
    SK: 'METADATA',
    GSI1PK: `SHARE#${shareToken}`,
    GSI1SK: 'GROUP',
    GSI2PK: `INITIATOR#${user.sub}`,
    GSI2SK: `GROUP#${id}`,
    id,
    name: body.name.trim(),
    pictureUrl: body.pictureUrl ?? null,
    shareToken,
    initiatorId: user.sub,
    requireTaskSelection: body.requireTaskSelection ?? true,
    scorecardVisibility: body.scorecardVisibility ?? 'all',
    scorecardViewerIds: body.scorecardViewerIds ?? [],
    reminderAt: body.reminderAt ?? null,
    createdAt: now,
  }

  await putItem(group)
  return created(stripKeys(group))
}

async function getGroupByShareToken(event) {
  const { shareToken } = event.pathParameters ?? {}
  if (!shareToken) return badRequest()

  const [group] = await queryGsi1(`SHARE#${shareToken}`)
  if (!group) return notFound('Groep niet gevonden')

  return ok(stripKeys(group))
}

async function getGroup(event) {
  const user = requireAuth(event)
  if (!user) return unauthorized()

  const { groupId: id } = event.pathParameters ?? {}
  const group = await getItem(`GROUP#${id}`, 'METADATA')
  if (!group) return notFound('Groep niet gevonden')
  if (group.initiatorId !== user.sub) return forbidden()

  return ok(stripKeys(group))
}

async function updateGroup(event) {
  const user = requireAuth(event)
  if (!user) return unauthorized()

  const { groupId: id } = event.pathParameters ?? {}
  const group = await getItem(`GROUP#${id}`, 'METADATA')
  if (!group) return notFound('Groep niet gevonden')
  if (group.initiatorId !== user.sub) return forbidden()

  const body = parseBody(event)
  const updated = {
    ...group,
    name: body.name?.trim() ?? group.name,
    pictureUrl: 'pictureUrl' in body ? body.pictureUrl : group.pictureUrl,
    requireTaskSelection: 'requireTaskSelection' in body ? body.requireTaskSelection : group.requireTaskSelection,
    scorecardVisibility: body.scorecardVisibility ?? group.scorecardVisibility,
    scorecardViewerIds: body.scorecardViewerIds ?? group.scorecardViewerIds,
    reminderAt: 'reminderAt' in body ? body.reminderAt : group.reminderAt,
  }

  await putItem(updated)
  return ok(stripKeys(updated))
}

async function deleteGroup(event) {
  const user = requireAuth(event)
  if (!user) return unauthorized()

  const { groupId: id } = event.pathParameters ?? {}
  const group = await getItem(`GROUP#${id}`, 'METADATA')
  if (!group) return notFound('Groep niet gevonden')
  if (group.initiatorId !== user.sub) return forbidden()

  await deleteItem(`GROUP#${id}`, 'METADATA')
  return noContent()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripKeys(item) {
  const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, ...rest } = item
  return rest
}

function requireAuth(event) {
  const token = extractBearer(event)
  if (!token) return null
  try {
    return verifyJwt(token)
  } catch {
    return null
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  try {
    const method = event.httpMethod
    const path = event.path?.replace(/\/$/, '')

    if (method === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS' }, body: '' }

    if (method === 'GET'    && path === '/groups')                         return await listGroups(event)
    if (method === 'POST'   && path === '/groups')                         return await createGroup(event)
    if (method === 'GET'    && path.startsWith('/groups/share/'))          return await getGroupByShareToken(event)
    if (method === 'GET'    && /^\/groups\/[^/]+$/.test(path))             return await getGroup(event)
    if (method === 'PATCH'  && /^\/groups\/[^/]+$/.test(path))             return await updateGroup(event)
    if (method === 'DELETE' && /^\/groups\/[^/]+$/.test(path))             return await deleteGroup(event)

    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Route niet gevonden' }) }
  } catch (err) {
    return serverError(err)
  }
}
