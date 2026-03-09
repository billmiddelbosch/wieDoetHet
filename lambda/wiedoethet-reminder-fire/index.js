/**
 * Reminder Fire Lambda — triggered by EventBridge one-time scheduled rules.
 *
 * NOT exposed via API Gateway. Receives the event payload set during
 * PutTargets: { ruleName: string }
 *
 * Delivery chain:
 *   1. Try Web Push (VAPID via web-push npm package)
 *   2. If push fails or no subscription, try SMS via SNS
 *   3. If neither channel available, mark status as 'failed'
 *
 * Function name: wiedoethet-reminder-fire
 * Runtime: nodejs24.x
 * Handler: index.handler
 *
 * Environment variables:
 *   TABLE_NAME         — DynamoDB table (default: wdh-main)
 *   VAPID_PUBLIC_KEY   — base64url VAPID public key
 *   VAPID_PRIVATE_KEY  — base64url VAPID private key (secret)
 *   VAPID_SUBJECT      — mailto: or https: contact URI for VAPID
 *   AWS_REGION         — AWS region (default: eu-west-2)
 */

import { getItem, queryByPk, queryGsi1, updateItem } from '../shared/db.js'
import { deleteRule } from '../shared/eventbridge.js'
import { sendWebPush, sendSms } from '../shared/sns.js'

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

// ─── Notification delivery ────────────────────────────────────────────────────

/**
 * Attempts to deliver a reminder notification via Web Push, falling back to SMS.
 *
 * @param {string} initiatorId
 * @param {string} groupId
 * @param {string} scope        'group' | 'task'
 * @param {string} scopeId
 * @param {{ name: string, shareToken: string }} group
 */
async function sendNotification(initiatorId, groupId, scope, scopeId, group) {
  const shareUrl = `https://wiedoethet.nl/g/${group.shareToken}`

  const pushBody =
    scope === 'group'
      ? `Nog niet genoeg deelnemers voor alle taken. Deel de link opnieuw: ${shareUrl}`
      : `Deze taak heeft nog niet genoeg deelnemers. Deel de link opnieuw: ${shareUrl}`

  const pushPayload = {
    title: group.name,
    body: pushBody,
    url: shareUrl,
    tag: `wdh-reminder-${scope}-${scopeId}`,
  }

  const smsMessage =
    scope === 'group'
      ? `Nog niet genoeg deelnemers voor alle taken in "${group.name}". Deel de link opnieuw: ${shareUrl}`
      : `Een taak in "${group.name}" heeft nog niet genoeg deelnemers. Deel de link opnieuw: ${shareUrl}`

  // 1. Try Web Push
  const pushSub = await getItem(`PUSH_SUB#${initiatorId}`, 'PUSH_SUB')
  if (pushSub?.endpoint) {
    try {
      await sendWebPush({ endpoint: pushSub.endpoint, keys: pushSub.keys }, pushPayload)
      console.warn(`reminder-fire: push sent successfully for ${scope} ${scopeId}`)
      return
    } catch (err) {
      console.warn(
        `reminder-fire: push failed for ${scope} ${scopeId} (status ${err.statusCode ?? 'unknown'}), trying SMS`,
      )
      // Fall through to SMS
    }
  }

  // 2. SMS fallback
  const initiator = await getItem(`USER#${initiatorId}`, 'PROFILE')
  if (initiator?.phoneNumber) {
    await sendSms(initiator.phoneNumber, smsMessage)
    console.warn(`reminder-fire: SMS sent successfully for ${scope} ${scopeId}`)
    return
  }

  // 3. No channel available
  console.warn(`reminder-fire: no delivery channel available for ${scope} ${scopeId}`)
  throw new Error('no_delivery_channel')
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

    await sendNotification(initiatorId, groupId, scope, scopeId, group)

    await updateItem(`REMINDER#${scope}#${scopeId}`, 'REMINDER', { status: 'sent' })
  } catch (err) {
    console.error(`reminder-fire: error processing ${ruleName}`, err)
    await updateItem(`REMINDER#${scope}#${scopeId}`, 'REMINDER', { status: 'failed' })
  } finally {
    // Always clean up the EventBridge rule
    await deleteRule(ruleName)
  }
}
