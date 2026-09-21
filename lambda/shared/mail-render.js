/**
 * Placeholder validation + substitution for lifecycle mail templates.
 *
 * Deliberately tiny: a plain regex replace of `{{token}}`, no template engine,
 * no logic, no partials (product/specs/mail-automation-api.spec.md § Placeholders).
 *   - validateTemplateText() runs on admin save and rejects unknown tokens;
 *   - renderTemplate() runs at send time. Values are HTML-escaped in the body;
 *     the subject is plain text, so values go in raw (newlines stripped).
 */

const TOKEN_RE = /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g
const FALLBACK_FIRST_NAME = 'daar'
const DEFAULT_APP_URL = 'https://wiedoethet.nl'

export const MAX_SUBJECT_LENGTH = 150
export const MAX_BODY_LENGTH = 50000

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Distinct `{{tokens}}` used in `text` that are not in `allowed`, in order of appearance. */
export function findUnknownTokens(text, allowed) {
  const unknown = []
  for (const match of String(text ?? '').matchAll(TOKEN_RE)) {
    if (!allowed.includes(match[1]) && !unknown.includes(match[1])) unknown.push(match[1])
  }
  return unknown
}

/** True for '', whitespace, and markup with no visible text (e.g. Tiptap's empty `<p></p>`). */
export function isEmptyHtml(html) {
  const text = String(html ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim()
  return text.length === 0
}

/**
 * Validates an admin-supplied override. Pass only the fields being saved
 * (`undefined` = not being changed, `null` = reset to default — both skipped).
 *
 * @returns {string | null} a Dutch, human-readable error message, or null when valid
 */
export function validateTemplateText({ subject, bodyHtml }, allowedVariables) {
  if (typeof subject === 'string') {
    const trimmed = subject.trim()
    if (!trimmed) return 'Onderwerp is verplicht'
    if (trimmed.length > MAX_SUBJECT_LENGTH) return `Onderwerp mag maximaal ${MAX_SUBJECT_LENGTH} tekens bevatten`
  } else if (subject !== undefined && subject !== null) {
    return 'Onderwerp moet tekst zijn'
  }

  if (typeof bodyHtml === 'string') {
    if (isEmptyHtml(bodyHtml)) return 'Berichttekst is verplicht'
    if (bodyHtml.length > MAX_BODY_LENGTH) return `Berichttekst mag maximaal ${MAX_BODY_LENGTH} tekens bevatten`
  } else if (bodyHtml !== undefined && bodyHtml !== null) {
    return 'Berichttekst moet tekst zijn'
  }

  const unknown = [
    ...findUnknownTokens(typeof subject === 'string' ? subject : '', allowedVariables),
    ...findUnknownTokens(typeof bodyHtml === 'string' ? bodyHtml : '', allowedVariables),
  ].filter((token, index, all) => all.indexOf(token) === index)
  if (unknown.length > 0) {
    return `Onbekend of niet toegestaan veld: ${unknown.map((token) => `{{${token}}}`).join(', ')}`
  }
  return null
}

export function getAppUrl() {
  return (process.env.APP_URL || DEFAULT_APP_URL).replace(/\/+$/, '')
}

/** First word of a display name; "daar" ("Hoi daar,") when there is none. */
export function firstNameOf(name) {
  const first = String(name ?? '').trim().split(/\s+/)[0]
  return first || FALLBACK_FIRST_NAME
}

/**
 * The raw (unescaped) placeholder values for one recipient.
 * Group-only values are present only when a group is given.
 */
export function buildVariables({ user, group }) {
  const appUrl = getAppUrl()
  const values = {
    firstName: firstNameOf(user?.name),
    appUrl,
    createGroupUrl: `${appUrl}/groups/new`,
  }
  if (group) {
    values.groupName = group.name ?? ''
    values.groupUrl = `${appUrl}/groups/${group.id}`
  }
  return values
}

function substitute(text, values, transform) {
  return String(text ?? '').replace(TOKEN_RE, (_match, token) => transform(values[token] ?? ''))
}

/**
 * Renders subject + body for one recipient. The result is the *body fragment*;
 * the caller wraps it in the branded shell (wrapEmailHtml) which adds the footer.
 *
 * @returns {{ subject: string, bodyHtml: string }}
 */
export function renderTemplate({ subject, bodyHtml }, values) {
  return {
    subject: substitute(subject, values, (v) => String(v).replace(/[\r\n]+/g, ' ')).trim(),
    bodyHtml: substitute(bodyHtml, values, escapeHtml),
  }
}
