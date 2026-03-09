/**
 * Push Subscriptions Lambda — handles:
 *   POST   /push-subscriptions        — save or overwrite subscription for authenticated user
 *   GET    /push-subscriptions/me     — check if current user has a subscription
 *   DELETE /push-subscriptions/me     — delete the current user's subscription
 *
 * Function name: wiedoethet-push-subscriptions
 * Runtime: nodejs24.x
 * Handler: index.handler
 *
 * Environment variables:
 *   TABLE_NAME   — DynamoDB table (default: wdh-main)
 *   JWT_SECRET   — HS256 signing secret
 *   AWS_REGION   — AWS region (default: eu-west-2)
 */

import {
  ok,
  created,
  noContent,
  badRequest,
  unauthorized,
  notFound,
  serverError,
  parseBody,
  extractBearer,
} from '../shared/http.js'
import { verifyJwt } from '../shared/jwt.js'
import { getItem, putItem, deleteItem } from '../shared/db.js'

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

// ─── Route handlers ───────────────────────────────────────────────────────────

async function savePushSubscription(event) {
  const user = requireAuth(event)
  if (!user) return unauthorized()

  const { endpoint, keys } = parseBody(event)

  if (!endpoint || typeof endpoint !== 'string') return badRequest('endpoint is verplicht')
  if (!keys?.p256dh || !keys?.auth) return badRequest('keys.p256dh en keys.auth zijn verplicht')

  await putItem({
    PK: `PUSH_SUB#${user.sub}`,
    SK: 'PUSH_SUB',
    userId: user.sub,
    endpoint,
    keys,
    createdAt: new Date().toISOString(),
  })

  return created({ ok: true })
}

async function getPushSubscription(event) {
  const user = requireAuth(event)
  if (!user) return unauthorized()

  const sub = await getItem(`PUSH_SUB#${user.sub}`, 'PUSH_SUB')
  if (!sub) return notFound('Geen push-abonnement gevonden')

  // Only confirm existence — do not return keys
  return ok({ endpoint: sub.endpoint })
}

async function deletePushSubscription(event) {
  const user = requireAuth(event)
  if (!user) return unauthorized()

  await deleteItem(`PUSH_SUB#${user.sub}`, 'PUSH_SUB')

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

    if (method === 'POST'   && path === '/push-subscriptions')
      return await savePushSubscription(event)

    if (method === 'GET'    && path === '/push-subscriptions/me')
      return await getPushSubscription(event)

    if (method === 'DELETE' && path === '/push-subscriptions/me')
      return await deletePushSubscription(event)

    return notFound('Route niet gevonden')
  } catch (err) {
    return serverError(err)
  }
}
