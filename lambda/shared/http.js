/**
 * HTTP response helpers for API Gateway proxy integration.
 * All handlers must return { statusCode, headers, body }.
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
}

export function ok(data) {
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) }
}

export function created(data) {
  return { statusCode: 201, headers: CORS_HEADERS, body: JSON.stringify(data) }
}

export function noContent() {
  return { statusCode: 204, headers: CORS_HEADERS, body: '' }
}

export function badRequest(message = 'Ongeldig verzoek') {
  return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message }) }
}

export function unauthorized(message = 'Niet ingelogd') {
  return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ message }) }
}

export function forbidden(message = 'Geen toegang') {
  return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ message }) }
}

export function notFound(message = 'Niet gevonden') {
  return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ message }) }
}

export function conflict(message = 'Conflict') {
  return { statusCode: 409, headers: CORS_HEADERS, body: JSON.stringify({ message }) }
}

export function serverError(err) {
  console.error(err)
  return {
    statusCode: 500,
    headers: CORS_HEADERS,
    body: JSON.stringify({ message: 'Interne serverfout' }),
  }
}

/** Parse JSON body safely; returns {} on empty or invalid input. */
export function parseBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {}
  } catch {
    return {}
  }
}

/** Extract Bearer token from the Authorization header. */
export function extractBearer(event) {
  const auth = event.headers?.Authorization ?? event.headers?.authorization ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  return token || null
}
