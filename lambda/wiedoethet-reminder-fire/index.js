/**
 * Reminder Fire Lambda — triggered by EventBridge one-time scheduled rules.
 *
 * NOT exposed via API Gateway. Receives the event payload set during
 * PutTargets: { ruleName: string }
 *
 * Function name: wiedoethet-reminder-fire
 * Runtime: nodejs24.x
 * Handler: index.handler
 *
 * Environment variables:
 *   TABLE_NAME          — DynamoDB table (default: wdh-main)
 *   WHATSAPP_TOKEN      — Meta permanent access token (Bearer)
 *   WHATSAPP_PHONE_ID   — Meta phone number object ID
 *   AWS_REGION          — AWS region (default: eu-west-2)
 */

import { getItem, queryByPk, queryGsi1, updateItem } from '../shared/db.js'
import { deleteRule } from '../shared/eventbridge.js'

const WHATSAPP_API = 'https://graph.facebook.com/v19.0'

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

async function sendWhatsApp(phoneNumber, messageText) {
  const phoneId = process.env.WHATSAPP_PHONE_ID
  const token = process.env.WHATSAPP_TOKEN

  if (!phoneId || !token) throw new Error('WHATSAPP_PHONE_ID or WHATSAPP_TOKEN env var is not set')

  const res = await fetch(`${WHATSAPP_API}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'text',
      text: { body: messageText },
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`WhatsApp API error ${res.status}: ${JSON.stringify(body)}`)
  }

  return res.json()
}

// ─── Minimum-claimants check ──────────────────────────────────────────────────

/**
 * Returns true when at least one task in the group has maxClaims set
 * and the current claim count is below that maximum.
 */
async function groupHasUnmetMinimums(groupId) {
  const taskItems = await queryByPk(`GROUP#${groupId}`, 'TASK#')

  const checks = await Promise.all(
    taskItems.map(async (task) => {
      if (!task.maxClaims) return false // no minimum set — skip
      const claims = await queryByPk(`TASK#${task.id}`, 'CLAIM#')
      return claims.length < task.maxClaims
    })
  )

  return checks.some(Boolean)
}

/**
 * Returns true when the specific task has maxClaims set and is not yet full.
 */
async function taskHasUnmetMinimum(taskId, groupId) {
  const taskItems = await queryByPk(`GROUP#${groupId}`, 'TASK#')
  const task = taskItems.find((t) => t.id === taskId)
  if (!task || !task.maxClaims) return false
  const claims = await queryByPk(`TASK#${taskId}`, 'CLAIM#')
  return claims.length < task.maxClaims
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  process.env.TABLE_NAME = process.env.TABLE_NAME ?? 'wdh-main'

  const { ruleName } = event

  if (!ruleName) {
    console.error('reminder-fire: missing ruleName in event payload', event)
    return
  }

  // Look up the reminder record via GSI1
  const [reminder] = await queryGsi1(`RULE#${ruleName}`)

  if (!reminder) {
    // Already cancelled — nothing to do
    console.warn(`reminder-fire: no reminder found for rule ${ruleName} — already cancelled`)
    return
  }

  if (reminder.status !== 'scheduled') {
    // Already processed (sent or failed) — exit cleanly
    console.warn(`reminder-fire: reminder ${ruleName} has status "${reminder.status}" — skipping`)
    await deleteRule(ruleName)
    return
  }

  const { scope, scopeId, groupId, initiatorId } = reminder

  try {
    // Load group for name and share token
    const group = await getItem(`GROUP#${groupId}`, 'METADATA')
    if (!group) {
      console.warn(`reminder-fire: group ${groupId} not found — aborting`)
      await updateItem(`REMINDER#${scope}#${scopeId}`, 'REMINDER', { status: 'failed' })
      await deleteRule(ruleName)
      return
    }

    // Check whether the minimum is still unmet
    let shouldSend
    if (scope === 'group') {
      shouldSend = await groupHasUnmetMinimums(groupId)
    } else {
      shouldSend = await taskHasUnmetMinimum(scopeId, groupId)
    }

    if (!shouldSend) {
      console.warn(`reminder-fire: all minimums met for ${scope} ${scopeId} — no message sent`)
      await updateItem(`REMINDER#${scope}#${scopeId}`, 'REMINDER', { status: 'sent' })
      await deleteRule(ruleName)
      return
    }

    // Load initiator phone number
    const initiator = await getItem(`USER#${initiatorId}`, 'PROFILE')
    if (!initiator?.phoneNumber) {
      console.warn(`reminder-fire: initiator ${initiatorId} has no phone number — aborting`)
      await updateItem(`REMINDER#${scope}#${scopeId}`, 'REMINDER', { status: 'failed' })
      await deleteRule(ruleName)
      return
    }

    const shareUrl = `https://wiedoethet.nl/g/${group.shareToken}`
    const messageText =
      `Herinnering: je groep "${group.name}" heeft nog niet genoeg deelnemers voor alle taken.\n` +
      `Deel de link opnieuw om iedereen te laten meedoen:\n${shareUrl}`

    await sendWhatsApp(initiator.phoneNumber, messageText)

    await updateItem(`REMINDER#${scope}#${scopeId}`, 'REMINDER', { status: 'sent' })
    console.warn(`reminder-fire: WhatsApp sent successfully for ${scope} ${scopeId}`)
  } catch (err) {
    console.error(`reminder-fire: error processing ${ruleName}`, err)
    await updateItem(`REMINDER#${scope}#${scopeId}`, 'REMINDER', { status: 'failed' })
  } finally {
    // Always clean up the EventBridge rule
    await deleteRule(ruleName)
  }
}
