/**
 * Wraps admin-authored rich-text HTML (from BaseRichTextEditor, via
 * POST /admin/mail) in wieDoetHet's branded email shell before it goes to
 * SES. Structure adapted from a sibling project's outbound-email template
 * (table-based layout for Outlook/Gmail compatibility); colors pulled from
 * this app's own `--color-brand-*` tokens in src/style.css rather than
 * reused as-is, since the source template used a different brand color.
 *
 * `bodyHtml` is trusted, already-composed markup (the admin's own rich-text
 * output) — it is inlined as-is, not escaped.
 */
export function wrapEmailHtml(bodyHtml) {
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
<div style="margin-top:32px;padding-top:24px;border-top:1px solid #e2e8f0;">
<p style="margin:0;font-size:13px;color:#64748b;">Dit bericht is verstuurd via <a href="https://wiedoethet.nl" style="color:#2080b8;text-decoration:none;">wiedoethet.nl</a></p>
</div>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}
