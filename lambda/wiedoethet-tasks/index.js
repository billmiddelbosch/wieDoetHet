/**
 * Tasks Lambda — handles:
 *   GET    /groups/{groupId}/tasks
 *   POST   /groups/{groupId}/tasks
 *   PATCH  /groups/{groupId}/tasks/{taskId}
 *   DELETE /groups/{groupId}/tasks/{taskId}
 *
 * Function name: wiedoethet-tasks
 * Runtime: nodejs24.x
 * Handler: index.handler
 */

import { randomUUID } from 'node:crypto'
import { ok, created, noContent, unauthorized, forbidden, notFound, badRequest, serverError, parseBody, extractBearer } from '../shared/http.js'
import { verifyJwt } from '../shared/jwt.js'
import { getItem, putItem, deleteItem, queryByPk } from '../shared/db.js'

// ─── Route handlers ──────────────────────────────────────────────────────────

async function listTasks(event) {
  const { groupId } = event.pathParameters ?? {}

  const items = await queryByPk(`GROUP#${groupId}`, 'TASK#')
  const tasks = items.map(stripKeys).sort((a, b) => a.order - b.order)

  const tasksWithClaims = await Promise.all(
    tasks.map(async (task) => {
      const claimItems = await queryByPk(`TASK#${task.id}`, 'CLAIM#')
      return { ...task, claims: claimItems.map(stripKeys) }
    })
  )

  return ok(tasksWithClaims)
}

async function createTask(event) {
  const user = requireAuth(event)
  if (!user) return unauthorized()

  const { groupId } = event.pathParameters ?? {}
  const group = await getItem(`GROUP#${groupId}`, 'METADATA')
  if (!group) return notFound('Groep niet gevonden')
  if (group.initiatorId !== user.sub) return forbidden()

  const body = parseBody(event)
  if (!body.title?.trim()) return badRequest('Titel is verplicht')

  const existingTasks = await queryByPk(`GROUP#${groupId}`, 'TASK#')
  const order = existingTasks.length

  const id = randomUUID()
  const task = {
    PK: `GROUP#${groupId}`,
    SK: `TASK#${String(order).padStart(5, '0')}#${id}`,
    id,
    groupId,
    title: body.title.trim(),
    description: body.description ?? null,
    maxClaims: body.maxClaims ?? 1,
    order,
  }

  await putItem(task)
  return created(stripKeys(task))
}

async function updateTask(event) {
  const user = requireAuth(event)
  if (!user) return unauthorized()

  const { groupId, taskId } = event.pathParameters ?? {}
  const group = await getItem(`GROUP#${groupId}`, 'METADATA')
  if (!group) return notFound('Groep niet gevonden')
  if (group.initiatorId !== user.sub) return forbidden()

  // Find the task (SK contains order prefix, so query then filter)
  const items = await queryByPk(`GROUP#${groupId}`, 'TASK#')
  const task = items.find((t) => t.id === taskId)
  if (!task) return notFound('Taak niet gevonden')

  const body = parseBody(event)
  const updated = {
    ...task,
    title: body.title?.trim() ?? task.title,
    description: 'description' in body ? body.description : task.description,
    maxClaims: 'maxClaims' in body ? body.maxClaims : task.maxClaims,
  }

  await putItem(updated)
  return ok(stripKeys(updated))
}

async function deleteTask(event) {
  const user = requireAuth(event)
  if (!user) return unauthorized()

  const { groupId, taskId } = event.pathParameters ?? {}
  const group = await getItem(`GROUP#${groupId}`, 'METADATA')
  if (!group) return notFound('Groep niet gevonden')
  if (group.initiatorId !== user.sub) return forbidden()

  const items = await queryByPk(`GROUP#${groupId}`, 'TASK#')
  const task = items.find((t) => t.id === taskId)
  if (!task) return notFound('Taak niet gevonden')

  await deleteItem(task.PK, task.SK)
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

    // /groups/{groupId}/tasks
    if (method === 'GET'  && /^\/groups\/[^/]+\/tasks$/.test(path))             return await listTasks(event)
    if (method === 'POST' && /^\/groups\/[^/]+\/tasks$/.test(path))             return await createTask(event)
    // /groups/{groupId}/tasks/{taskId}
    if (method === 'PATCH'  && /^\/groups\/[^/]+\/tasks\/[^/]+$/.test(path))   return await updateTask(event)
    if (method === 'DELETE' && /^\/groups\/[^/]+\/tasks\/[^/]+$/.test(path))   return await deleteTask(event)

    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Route niet gevonden' }) }
  } catch (err) {
    return serverError(err)
  }
}
