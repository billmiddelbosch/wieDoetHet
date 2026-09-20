/**
 * Wraps rich-text HTML (admin-authored via POST /admin/mail, or a lifecycle
 * template body) in wieDoetHet's branded email shell before it goes to SES.
 * Structure adapted from a sibling project's outbound-email template
 * (table-based layout for Outlook/Gmail compatibility); colors pulled from
 * this app's own `--color-brand-*` tokens in src/style.css rather than
 * reused as-is, since the source template used a different brand color.
 *
 * `bodyHtml` is trusted, already-composed markup — it is inlined as-is, not
 * escaped. The footer is NOT part of `bodyHtml`: it is appended here so it is
 * impossible to send a branded mail without the suggestions invitation and the
 * opt-out explanation (product/specs/mail-automation-api.spec.md § Footer).
 */

/** Promise made in the opt-out footer. One constant so the number is a one-line change. */
export const OPT_OUT_PROCESSING_TEXT = 'binnen 2 werkdagen'

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

function footerHtml(replyToEmail) {
  const safeEmail = escapeHtml(replyToEmail)
  const link = `<a href="mailto:${safeEmail}" style="color:#2080b8;text-decoration:underline;">${safeEmail}</a>`
  return `<div style="margin-top:32px;padding-top:24px;border-top:1px solid #e2e8f0;">
<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#1e293b;font-weight:600;">Ideeën om Wie Doet Het beter te maken?</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">Laat het ons weten! Antwoord gewoon op deze e-mail met je suggestie — we lezen elk bericht.</p>
<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#1e293b;font-weight:600;">Geen e-mails meer van ons?</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">Antwoord op deze e-mail met het woord &quot;afmelden&quot; (of mail naar ${link}). Wij zetten je dan uit onze mailinglijst — ${OPT_OUT_PROCESSING_TEXT}. Meer hoef je niet te doen.</p>
</div>`
}

/**
 * @param {string} bodyHtml
 * @param {{ replyToEmail?: string }} [options] — the monitored mailbox shown in the
 *   footer; defaults to SES_REPLY_TO_EMAIL. Throws when neither is set, mirroring
 *   sendMail: a mail that promises replies are read must have somewhere to send them.
 */
export function wrapEmailHtml(bodyHtml, { replyToEmail = process.env.SES_REPLY_TO_EMAIL } = {}) {
  if (!replyToEmail) throw new Error('SES_REPLY_TO_EMAIL env var is not set')
  return `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:40px;max-width:600px;">
<tr><td>
<div style="margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #e2e8f0;">
<span style="font-size:20px;font-weight:700;color:#2080b8;letter-spacing:-0.5px;">wieDoetHet</span>
</div>
<div style="font-size:15px;line-height:1.7;color:#1e293b;">${bodyHtml}</div>
${footerHtml(replyToEmail)}
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
<p style="margin:0;font-size:13px;color:#64748b;">Dit bericht is verstuurd via <a href="https://wiedoethet.nl" style="color:#2080b8;text-decoration:none;">wiedoethet.nl</a></p>
</div>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}
