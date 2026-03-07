/**
 * WhatsApp Lambda — handles:
 *   POST /groups/{groupId}/whatsapp-poll  — send interactive WhatsApp poll
 *   GET  /webhook/whatsapp               — Meta webhook verification
 *   POST /webhook/whatsapp               — receive replies → create claims
 *
 * Function name: wiedoethet-whatsapp
 * Runtime: nodejs24.x
 * Handler: index.handler
 *
 * Required env vars:
 *   WHATSAPP_PHONE_NUMBER_ID  — Meta phone number ID
 *   WHATSAPP_ACCESS_TOKEN     — Meta system user access token
 *   WHATSAPP_APP_SECRET       — Meta app secret (for signature verification)
 *   WHATSAPP_VERIFY_TOKEN     — arbitrary secret for webhook verification
 */

import { createHmac, randomUUID } from 'node:crypto'
import {
  ok, badRequest, unauthorized, forbidden, notFound, serverError,
  parseBody, extractBearer,
} from '../shared/http.js'
import { verifyJwt } from '../shared/jwt.js'
import { getItem, putItem, queryByPk } from '../shared/db.js'

const META_API_BASE = 'https://graph.facebook.com/v20.0'
const ALWAYS_200 = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: '{}' }

// ─── Send poll ────────────────────────────────────────────────────────────────

async function sendPoll(event) {
  const user = requireAuth(event)
  if (!user) return unauthorized()

  const { groupId } = event.pathParameters ?? {}
  const group = await getItem(`GROUP#${groupId}`, 'METADATA')
  if (!group) return notFound('Groep niet gevonden')
  if (group.initiatorId !== user.sub) return forbidden()

  const { to, tasks } = parseBody(event)
  if (!to) return badRequest('Telefoonnummer is verplicht')
  if (!tasks?.length) return badRequest('Geen taken opgegeven')
  if (tasks.length > 10) return badRequest('Te veel taken — splits de groep in twee groepen')

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneNumberId || !accessToken) return serverError(new Error('WhatsApp niet geconfigureerd'))

  const message = tasks.length <= 3
    ? buildButtonMessage(to, group.name, groupId, tasks)
    : buildListMessage(to, group.name, groupId, tasks)

  const res = await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('WhatsApp API error', err)
    return {
      statusCode: res.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ message: err?.error?.message ?? 'WhatsApp fout' }),
    }
  }

  return ok({ sent: true })
}

function buildButtonMessage(to, groupName, groupId, tasks) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `Wie doet wat voor "${groupName}"?\n\nKies de taak die jij wilt doen:` },
      action: {
        buttons: tasks.map((t) => ({
          type: 'reply',
          reply: {
            id: `${groupId}:${t.id}`,
            title: t.title.slice(0, 20),
          },
        })),
      },
    },
  }
}

function buildListMessage(to, groupName, groupId, tasks) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: groupName },
      body: { text: 'Kies de taak die jij wilt doen:' },
      footer: { text: 'wieDoetHet' },
      action: {
        button: 'Kies een taak',
        sections: [{
          title: 'Taken',
          rows: tasks.map((t) => ({
            id: `${groupId}:${t.id}`,
            title: t.title.slice(0, 24),
            description: (t.description ?? '').slice(0, 72),
          })),
        }],
      },
    },
  }
}

// ─── Webhook verification ─────────────────────────────────────────────────────

function verifyWebhook(event) {
  const params = event.queryStringParameters ?? {}
  const mode = params['hub.mode']
  const token = params['hub.verify_token']
  const challenge = params['hub.challenge']

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: challenge }
  }
  return { statusCode: 403, headers: {}, body: 'Forbidden' }
}

// ─── Webhook message receiver ─────────────────────────────────────────────────

async function handleWebhook(event) {
  // Verify Meta signature
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (appSecret) {
    const sig = event.headers?.['X-Hub-Signature-256'] ?? event.headers?.['x-hub-signature-256'] ?? ''
    const expected = 'sha256=' + createHmac('sha256', appSecret).update(event.body ?? '').digest('hex')
    if (sig !== expected) {
      console.warn('Invalid webhook signature')
      return ALWAYS_200
    }
  }

  let payload
  try { payload = JSON.parse(event.body ?? '{}') } catch { return ALWAYS_200 }

  const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
  const contacts = payload.entry?.[0]?.changes?.[0]?.value?.contacts ?? []

  if (!message || message.type !== 'interactive') return ALWAYS_200

  const interactiveType = message.interactive?.type
  const replyId =
    interactiveType === 'button_reply' ? message.interactive.button_reply?.id :
    interactiveType === 'list_reply'   ? message.interactive.list_reply?.id   : null

  if (!replyId) return ALWAYS_200

  const [groupId, taskId] = replyId.split(':')
  if (!groupId || !taskId) return ALWAYS_200

  const from = message.from
  const displayName = contacts.find((c) => c.wa_id === from)?.profile?.name ?? from

  // Resolve task
  const taskItems = await queryByPk(`GROUP#${groupId}`, 'TASK#')
  const task = taskItems.find((t) => t.id === taskId)
  if (!task) return ALWAYS_200

  const existingClaims = await queryByPk(`TASK#${taskId}`, 'CLAIM#')

  // Deduplicate: same phone can't claim the same task twice
  if (existingClaims.some((c) => c.sessionId === from)) return ALWAYS_200

  // Check capacity
  if (task.maxClaims !== null && existingClaims.length >= task.maxClaims) return ALWAYS_200

  const id = randomUUID()
  const now = new Date().toISOString()

  await putItem({
    PK: `TASK#${taskId}`,
    SK: `CLAIM#${id}`,
    GSI1PK: `GCLAIM#${groupId}`,
    GSI1SK: now,
    id,
    groupId,
    taskId,
    userId: null,
    anonymousName: displayName,
    sessionId: from,
    claimedAt: now,
  })

  return ALWAYS_200
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireAuth(event) {
  const token = extractBearer(event)
  if (!token) return null
  try { return verifyJwt(token) } catch { return null }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  process.env.TABLE_NAME = event.stageVariables?.tableName ?? process.env.TABLE_NAME ?? 'wdh-main'
  try {
    const method = event.httpMethod
    const path = event.path?.replace(/\/$/, '')

    if (method === 'OPTIONS') return {
      statusCode: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' },
      body: '',
    }

    if (method === 'GET'  && path === '/webhook/whatsapp')                        return verifyWebhook(event)
    if (method === 'POST' && path === '/webhook/whatsapp')                        return await handleWebhook(event)
    if (method === 'POST' && /^\/groups\/[^/]+\/whatsapp-poll$/.test(path))       return await sendPoll(event)

    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Route niet gevonden' }) }
  } catch (err) {
    return serverError(err)
  }
}
