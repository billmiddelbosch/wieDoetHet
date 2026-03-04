/**
 * Claims Lambda — handles:
 *   POST   /groups/{groupId}/tasks/{taskId}/claim
 *   DELETE /groups/{groupId}/tasks/{taskId}/claim
 *   GET    /groups/{groupId}/claims
 *
 * Function name: wiedoethet-claims
 * Runtime: nodejs24.x
 * Handler: index.handler
 */

import { randomUUID } from 'node:crypto'
import { ok, created, noContent, unauthorized, forbidden, notFound, conflict, serverError, parseBody, extractBearer } from '../shared/http.js'
import { verifyJwt } from '../shared/jwt.js'
import { getItem, putItem, deleteItem, queryByPk, queryGsi1, keys } from '../shared/db.js'

// ─── Route handlers ──────────────────────────────────────────────────────────

async function claimTask(event) {
  const { groupId, taskId } = event.pathParameters ?? {}
  const jwtPayload = tryAuth(event)
  const body = parseBody(event)

  // Validate identity: authenticated user OR anonymous with name + sessionId
  if (!jwtPayload && (!body.anonymousName || !body.sessionId)) {
    return unauthorized('Naam en sessie-ID zijn verplicht voor anonieme claims')
  }

  // Resolve task (SK contains order-prefix so we query and filter)
  const taskItems = await queryByPk(`GROUP#${groupId}`, 'TASK#')
  const task = taskItems.find((t) => t.id === taskId)
  if (!task) return notFound('Taak niet gevonden')

  // Check capacity
  const existingClaims = await queryByPk(`TASK#${taskId}`, 'CLAIM#')
  if (existingClaims.length >= (task.maxClaims ?? 1)) return conflict('Taak is al vol')

  // Prevent duplicate claim by same user/session
  const alreadyClaimed = existingClaims.some((c) =>
    jwtPayload ? c.userId === jwtPayload.sub : c.sessionId === body.sessionId
  )
  if (alreadyClaimed) return conflict('Je hebt deze taak al geclaimd')

  const id = randomUUID()
  const now = new Date().toISOString()

  const claim = {
    PK: `TASK#${taskId}`,
    SK: `CLAIM#${id}`,
    GSI1PK: `GCLAIM#${groupId}`,
    GSI1SK: now,
    id,
    groupId,
    taskId,
    userId: jwtPayload?.sub ?? null,
    anonymousName: jwtPayload ? null : body.anonymousName,
    sessionId: jwtPayload ? null : body.sessionId,
    claimedAt: now,
  }

  await putItem(claim)
  return created(stripKeys(claim))
}

async function unclaimTask(event) {
  const { groupId, taskId } = event.pathParameters ?? {}
  const jwtPayload = tryAuth(event)
  const body = parseBody(event)

  const claims = await queryByPk(`TASK#${taskId}`, 'CLAIM#')
  const claim = claims.find((c) =>
    jwtPayload ? c.userId === jwtPayload.sub : c.sessionId === body.sessionId
  )
  if (!claim) return notFound('Claim niet gevonden')

  await deleteItem(claim.PK, claim.SK)
  return noContent()
}

async function listClaims(event) {
  const { groupId } = event.pathParameters ?? {}
  const jwtPayload = tryAuth(event)

  // Enforce scorecard visibility rules
  const group = await getItem(`GROUP#${groupId}`, 'METADATA')
  if (!group) return notFound('Groep niet gevonden')

  const vis = group.scorecardVisibility
  if (vis === 'initiator' && jwtPayload?.sub !== group.initiatorId) return forbidden('Alleen de initiator kan het scorebord zien')
  if (vis === 'selected') {
    const allowed = group.scorecardViewerIds ?? []
    if (!jwtPayload || (!allowed.includes(jwtPayload.sub) && jwtPayload.sub !== group.initiatorId)) {
      return forbidden('Je hebt geen toegang tot het scorebord')
    }
  }

  const claims = await queryGsi1(`GCLAIM#${groupId}`)

  // Batch-resolve unique taskIds and userIds in parallel
  const taskIds = [...new Set(claims.map((c) => c.taskId))]
  const userIds = [...new Set(claims.map((c) => c.userId).filter(Boolean))]

  const [taskItems, userRecords] = await Promise.all([
    queryByPk(`GROUP#${groupId}`, 'TASK#'),
    Promise.all(userIds.map((uid) => getItem(`USER#${uid}`, 'PROFILE'))),
  ])

  const taskMap = Object.fromEntries(taskItems.map((t) => [t.id, t.title]))
  const userMap = Object.fromEntries(
    userRecords.filter(Boolean).map((u) => [u.id, u.name])
  )

  const enriched = claims.map((c) => ({
    ...stripKeys(c),
    taskTitle: taskMap[c.taskId] ?? '?',
    claimedByName: c.userId ? (userMap[c.userId] ?? 'Onbekend') : c.anonymousName ?? 'Anoniem',
  }))

  return ok(enriched)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripKeys(item) {
  const { PK, SK, GSI1PK, GSI1SK, ...rest } = item
  return rest
}

function tryAuth(event) {
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

    // /groups/{groupId}/tasks/{taskId}/claim
    if (method === 'POST'   && /^\/groups\/[^/]+\/tasks\/[^/]+\/claim$/.test(path)) return await claimTask(event)
    if (method === 'DELETE' && /^\/groups\/[^/]+\/tasks\/[^/]+\/claim$/.test(path)) return await unclaimTask(event)
    // /groups/{groupId}/claims
    if (method === 'GET'    && /^\/groups\/[^/]+\/claims$/.test(path))              return await listClaims(event)

    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Route niet gevonden' }) }
  } catch (err) {
    return serverError(err)
  }
}
