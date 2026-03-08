/**
 * EventBridge helpers for one-time scheduled rules.
 *
 * Used by wiedoethet-reminders to create/delete scheduled reminder rules,
 * and by wiedoethet-reminder-fire to self-clean after firing.
 *
 * Environment variables:
 *   AWS_REGION                — AWS region (default: eu-west-2)
 *   REMINDER_FIRE_LAMBDA_ARN  — Full ARN of the wiedoethet-reminder-fire Lambda
 */

import {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
  DeleteRuleCommand,
} from '@aws-sdk/client-eventbridge'

const eb = new EventBridgeClient({ region: process.env.AWS_REGION ?? 'eu-west-2' })

const FIRE_LAMBDA_ARN = process.env.REMINDER_FIRE_LAMBDA_ARN
const TARGET_ID = 'ReminderFireTarget'

/**
 * Create a one-time EventBridge scheduled rule and point it at the fire Lambda.
 *
 * @param {string} ruleName     e.g. 'wdh-reminder-task-abc123'
 * @param {string} scheduledAt  ISO 8601 UTC string — seconds precision is used
 * @param {object} inputPayload JSON-serialisable object passed as the Lambda event
 * @returns {Promise<string>}   the created rule ARN
 */
export async function scheduleOneTimeRule(ruleName, scheduledAt, inputPayload) {
  if (!FIRE_LAMBDA_ARN) throw new Error('REMINDER_FIRE_LAMBDA_ARN env var is not set')

  // EventBridge at() requires format: at(yyyy-mm-ddThh:mm:ss) — strip ms and Z
  const atExpr = `at(${scheduledAt.slice(0, 19)})`

  const { RuleArn } = await eb.send(
    new PutRuleCommand({
      Name: ruleName,
      ScheduleExpression: atExpr,
      State: 'ENABLED',
    })
  )

  await eb.send(
    new PutTargetsCommand({
      Rule: ruleName,
      Targets: [
        {
          Id: TARGET_ID,
          Arn: FIRE_LAMBDA_ARN,
          Input: JSON.stringify(inputPayload),
        },
      ],
    })
  )

  return RuleArn
}

/**
 * Remove all targets from a rule then delete it.
 * Safe to call when the rule no longer exists — swallows ResourceNotFoundException.
 *
 * @param {string} ruleName
 */
export async function deleteRule(ruleName) {
  try {
    await eb.send(new RemoveTargetsCommand({ Rule: ruleName, Ids: [TARGET_ID] }))
    await eb.send(new DeleteRuleCommand({ Name: ruleName }))
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err
  }
}
