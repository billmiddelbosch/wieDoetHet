/**
 * AWS SES (Simple Email Service) — outbound transactional/bulk email.
 *
 * Used by wiedoethet-admin's POST /admin/mail (Admin Mail Users feature).
 * See product/specs/admin-api.spec.md and lambda/SES_SETUP.md for the full
 * contract and manual AWS Console setup steps (domain verification, sandbox
 * vs. production access, IAM).
 *
 * Environment variables:
 *   SES_FROM_EMAIL — verified sending identity, e.g. noreply@wiedoethet.nl
 *                    (required — sendMail throws if unset)
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
 * @throws if SES_FROM_EMAIL is unset, or the SES API call fails
 */
export async function sendMail({ to, subject, html }) {
  const fromEmail = process.env.SES_FROM_EMAIL
  if (!fromEmail) throw new Error('SES_FROM_EMAIL env var is not set')

  await client.send(new SendEmailCommand({
    Source: fromEmail,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: html, Charset: 'UTF-8' } },
    },
  }))
}
