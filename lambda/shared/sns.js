/**
 * Notification delivery helpers.
 *
 * sendWebPush — sends a Web Push notification via VAPID using the `web-push` package.
 * sendSms     — sends a plain SMS via SNS direct publish (no topic, no endpoint).
 *
 * Environment variables (reminder-fire Lambda):
 *   VAPID_PUBLIC_KEY   — base64url-encoded VAPID public key
 *   VAPID_PRIVATE_KEY  — base64url-encoded VAPID private key (secret)
 *   VAPID_SUBJECT      — mailto: or https: contact URI
 */

import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'
import webpush from 'web-push'

const sns = new SNSClient({})

// ─── Web Push ─────────────────────────────────────────────────────────────────

/**
 * Sends a Web Push notification via VAPID.
 *
 * @param {{ endpoint: string, keys: { p256dh: string, auth: string } }} subscription
 * @param {{ title: string, body: string, url: string, tag: string }} payload
 */
export async function sendWebPush(subscription, payload) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
  await webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: subscription.keys },
    JSON.stringify(payload),
  )
}

// ─── SMS ──────────────────────────────────────────────────────────────────────

/**
 * Sends a plain SMS via SNS direct publish.
 *
 * @param {string} phoneNumber  E.164 format, e.g. +31612345678
 * @param {string} message
 */
export async function sendSms(phoneNumber, message) {
  await sns.send(
    new PublishCommand({
      PhoneNumber: phoneNumber,
      Message: message,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional',
        },
      },
    }),
  )
}
