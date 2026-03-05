/**
 * Minimal JWT (HS256) implementation using Node.js 24 built-in crypto.
 * No external dependencies required.
 *
 * Environment variables:
 *   JWT_SECRET        — HMAC signing secret (required, min 32 chars)
 *   JWT_EXPIRES_SEC   — Token lifetime in seconds (default: 2592000 = 30 days)
 */

import { createHmac } from 'node:crypto'

const SECRET = process.env.JWT_SECRET
const EXPIRES_SEC = Number(process.env.JWT_EXPIRES_SEC ?? 2592000)

function b64url(str) {
  return Buffer.from(str).toString('base64url')
}

function b64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8')
}

function sign(header, body) {
  return createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
}

/**
 * Sign a JWT with HS256.
 * @param {object} payload — claims to embed (do NOT include exp — it is added automatically)
 * @returns {string} signed JWT
 */
export function signJwt(payload) {
  if (!SECRET) throw new Error('JWT_SECRET env var is not set')
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const exp = Math.floor(Date.now() / 1000) + EXPIRES_SEC
  const body = b64url(JSON.stringify({ ...payload, exp, iat: Math.floor(Date.now() / 1000) }))
  const sig = sign(header, body)
  return `${header}.${body}.${sig}`
}

/**
 * Verify a JWT and return its payload.
 * @param {string} token
 * @returns {object} decoded payload
 * @throws if signature is invalid or token is expired
 */
export function verifyJwt(token) {
  if (!SECRET) throw new Error('JWT_SECRET env var is not set')
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Malformed token')
  const [header, body, sig] = parts
  const expected = sign(header, body)
  // Constant-time comparison to prevent timing attacks
  if (sig.length !== expected.length) throw new Error('Invalid signature')
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  if (diff !== 0) throw new Error('Invalid signature')
  const payload = JSON.parse(b64urlDecode(body))
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired')
  return payload
}
