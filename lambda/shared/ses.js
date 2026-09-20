/**
 * AWS SES (Simple Email Service) — outbound transactional/bulk email.
 *
 * Used by wiedoethet-admin's POST /admin/mail (Admin Mail Users feature) and
 * by the scheduled wiedoethet-lifecycle Lambda (mail automation).
 * See product/specs/admin-api.spec.md, product/specs/mail-automation-api.spec.md
 * and lambda/SES_SETUP.md for the full contract and manual AWS Console setup
 * steps (domain verification, sandbox vs. production access, IAM).
 *
 * Environment variables:
 *   SES_FROM_EMAIL     — verified sending identity, e.g. noreply@wiedoethet.nl
 *                        (required — sendMail throws if unset)
 *   SES_REPLY_TO_EMAIL — the MONITORED mailbox every mail's footer tells users to
 *                        reply to (suggestions, opt-out requests). Required —
 *                        sendMail throws if it cannot resolve one.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const client = new SESClient({})

/**
 * Send a single HTML email via SES. One call per recipient — callers are
 * responsible for concurrency limits and per-recipient error handling (SES
 * sandbox is capped at ~1 send/sec; see SES_SETUP.md).
 *
 * @param {object} params
 * @param {string} params.to — recipient email address
 * @param {string} params.subject
 * @param {string} params.html — HTML body
 * @param {string} [params.replyTo] — Reply-To address; defaults to SES_REPLY_TO_EMAIL
 * @returns {Promise<{ messageId: string | null }>}
 * @throws if SES_FROM_EMAIL is unset, no Reply-To address resolves, or the SES API call fails.
 *   Fails closed on a missing Reply-To: every mail promises "just reply to this
 *   e-mail", and replies to the noreply From address would be lost.
 */
export async function sendMail({ to, subject, html, replyTo }) {
  const fromEmail = process.env.SES_FROM_EMAIL
  if (!fromEmail) throw new Error('SES_FROM_EMAIL env var is not set')
  const replyToEmail = replyTo ?? process.env.SES_REPLY_TO_EMAIL
  if (!replyToEmail) throw new Error('SES_REPLY_TO_EMAIL env var is not set')

  const result = await client.send(new SendEmailCommand({
    Source: fromEmail,
    Destination: { ToAddresses: [to] },
    ReplyToAddresses: [replyToEmail],
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: html, Charset: 'UTF-8' } },
    },
  }))
  return { messageId: result?.MessageId ?? null }
}
