/**
 * Reminders Lambda — handles:
 *   POST   /reminders
 *   GET    /reminders/{scope}/{id}
 *   DELETE /reminders/{scope}/{id}
 *
 * Function name: wiedoethet-reminders
 * Runtime: nodejs24.x
 * Handler: index.handler
 *
 * Environment variables:
 *   TABLE_NAME                — DynamoDB table (default: wdh-main)
 *   JWT_SECRET                — HS256 signing secret
 *   REMINDER_FIRE_LAMBDA_ARN  — ARN of wiedoethet-reminder-fire
 *   AWS_REGION                — AWS region (default: eu-west-2)
 */

import {
  ok,
  created,
  noContent,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  serverError,
  parseBody,
  extractBearer,
} from '../shared/http.js'
import { verifyJwt } from '../shared/jwt.js'
import { getItem, putItem, deleteItem, queryByPk } from '../shared/db.js'
import { scheduleOneTimeRule, deleteRule } from '../shared/eventbridge.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireAuth(event) {
  const token = extractBearer(event)
  if (!token) return null
  try {
    return verifyJwt(token)
  } catch {
    return null
  }
}

function stripKeys(item) {
  // eslint-disable-next-line no-unused-vars
  const { PK, SK, GSI1PK, GSI1SK, ...rest } = item
  return rest
}

/**
 * Build an EventBridge rule name from scope and id.
 * Format: wdh-reminder-{scope}-{id}
 * Max 64 chars — safe: prefix(18) + UUID(36) = 54 chars for task, 19 + 36 = 55 for group.
 */
function buildRuleName(scope, id) {
  return `wdh-reminder-${scope}-${id}`
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function scheduleReminder(event) {
  const user = requireAuth(event)
  if (!user) return unauthorized()

  const body = parseBody(event)
  const { scope, id, scheduledAt, groupId } = body

  // Validate required fields
  if (!scope || !['task', 'group'].includes(scope)) return badRequest('scope must be "task" or "group"')
  if (!id) return badRequest('id is verplicht')
  if (!scheduledAt) return badRequest('scheduledAt is verplicht')

  // Validate scheduledAt is a valid future ISO datetime
  const scheduledDate = new Date(scheduledAt)
  if (isNaN(scheduledDate.getTime())) return badRequest('scheduledAt is geen geldige datum')
  if (scheduledDate <= new Date()) return badRequest('scheduledAt moet in de toekomst liggen')

  // Resolve ownership and get the group record
  let group
  if (scope === 'group') {
    group = await getItem(`GROUP#${id}`, 'METADATA')
    if (!group) return notFound('Groep niet gevonden')
    if (group.initiatorId !== user.sub) return forbidden()
  } else {
    // scope === 'task': groupId is required in body
    if (!groupId) return badRequest('groupId is verplicht voor task-herinneringen')
    group = await getItem(`GROUP#${groupId}`, 'METADATA')
    if (!group) return notFound('Groep niet gevonden')
    if (group.initiatorId !== user.sub) return forbidden()
    // Verify the task exists in this group
    const taskItems = await queryByPk(`GROUP#${groupId}`, 'TASK#')
    const task = taskItems.find((t) => t.id === id)
    if (!task) return notFound('Taak niet gevonden')
  }

  const scopeGroupId = scope === 'group' ? id : groupId
  const ruleName = buildRuleName(scope, id)
  const scheduledAtIso = scheduledDate.toISOString()

  // Idempotent: if a reminder already exists, delete its EventBridge rule first
  const existing = await getItem(`REMINDER#${scope}#${id}`, 'REMINDER')
  if (existing?.ruleName) {
    await deleteRule(existing.ruleName)
  }

  // Create EventBridge one-time rule targeting the fire Lambda
  await scheduleOneTimeRule(ruleName, scheduledAtIso, { ruleName })

  // Persist the reminder record
  const now = new Date().toISOString()
  const reminder = {
    PK: `REMINDER#${scope}#${id}`,
    SK: 'REMINDER',
    GSI1PK: `RULE#${ruleName}`,
    GSI1SK: 'REMINDER',
    scope,
    scopeId: id,
    groupId: scopeGroupId,
    initiatorId: user.sub,
    scheduledAt: scheduledAtIso,
    ruleName,
    status: 'scheduled',
    createdAt: now,
  }

  await putItem(reminder)

  return created(stripKeys(reminder))
}

async function getReminder(event) {
  const user = requireAuth(event)
  if (!user) return unauthorized()

  const parts = event.path?.replace(/\/$/, '').split('/')
  // path: /reminders/{scope}/{id} → ['', 'reminders', scope, id]
  const scope = parts[2]
  const id = parts[3]

  if (!scope || !id) return badRequest()

  const reminder = await getItem(`REMINDER#${scope}#${id}`, 'REMINDER')
  if (!reminder) {
    return ok({ scope, id, scheduledAt: null, status: 'none' })
  }
  if (reminder.initiatorId !== user.sub) return forbidden()

  return ok(stripKeys(reminder))
}

async function cancelReminder(event) {
  const user = requireAuth(event)
  if (!user) return unauthorized()

  const parts = event.path?.replace(/\/$/, '').split('/')
  const scope = parts[2]
  const id = parts[3]

  if (!scope || !id) return badRequest()

  const reminder = await getItem(`REMINDER#${scope}#${id}`, 'REMINDER')
  if (!reminder) return notFound('Herinnering niet gevonden')
  if (reminder.initiatorId !== user.sub) return forbidden()

  // Delete EventBridge rule (safe if already gone)
  await deleteRule(reminder.ruleName)

  // Delete DynamoDB record
  await deleteItem(`REMINDER#${scope}#${id}`, 'REMINDER')

  return noContent()
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  process.env.TABLE_NAME = event.stageVariables?.tableName ?? process.env.TABLE_NAME ?? 'wdh-main'
  try {
    const method = event.httpMethod
    const path = event.path?.replace(/\/$/, '')

    if (method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        },
        body: '',
      }
    }

    if (method === 'POST'   && path === '/reminders')
      return await scheduleReminder(event)

    if (method === 'GET'    && /^\/reminders\/(task|group)\/[^/]+$/.test(path))
      return await getReminder(event)

    if (method === 'DELETE' && /^\/reminders\/(task|group)\/[^/]+$/.test(path))
      return await cancelReminder(event)

    return notFound('Route niet gevonden')
  } catch (err) {
    return serverError(err)
  }
}
