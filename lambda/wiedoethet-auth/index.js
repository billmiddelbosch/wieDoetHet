/**
 * Auth Lambda — handles:
 *   POST /auth/login
 *   POST /auth/register
 *   GET  /auth/me
 *
 * Function name: wiedoethet-auth
 * Runtime: nodejs24.x
 * Handler: index.handler
 */

import { randomUUID } from 'node:crypto'
import { ok, created, unauthorized, conflict, badRequest, serverError, parseBody, extractBearer } from '../shared/http.js'
import { signJwt, verifyJwt } from '../shared/jwt.js'
import { hashPassword, verifyPassword } from '../shared/password.js'
import { getItem, putItem, updateItem, queryGsi1 } from '../shared/db.js'

// ─── Route handlers ──────────────────────────────────────────────────────────

async function login(event) {
  const { email, password } = parseBody(event)
  if (!email || !password) return badRequest('E-mailadres en wachtwoord zijn verplicht')

  const [userRecord] = await queryGsi1(`EMAIL#${email.toLowerCase()}`)
  if (!userRecord) return unauthorized('Ongeldig e-mailadres of wachtwoord')

  const valid = await verifyPassword(password, userRecord.passwordHash)
  if (!valid) return unauthorized('Ongeldig e-mailadres of wachtwoord')

  const token = signJwt({ sub: userRecord.id, email: userRecord.email })
  return ok({ token, user: safeUser(userRecord) })
}

async function register(event) {
  const { name, email, password } = parseBody(event)
  if (!name) return badRequest('Naam is verplicht')
  if (!email) return badRequest('E-mailadres is verplicht')
  if (!password || password.length < 8) return badRequest('Wachtwoord moet minimaal 8 tekens bevatten')

  const emailLower = email.toLowerCase()
  const [existing] = await queryGsi1(`EMAIL#${emailLower}`)
  if (existing) return conflict('E-mailadres al in gebruik')

  const id = randomUUID()
  const passwordHash = await hashPassword(password)
  const now = new Date().toISOString()

  const user = {
    PK: `USER#${id}`,
    SK: 'PROFILE',
    GSI1PK: `EMAIL#${emailLower}`,
    GSI1SK: 'USER',
    id,
    name,
    email: emailLower,
    passwordHash,
    avatarUrl: null,
    createdAt: now,
  }
  await putItem(user)

  const token = signJwt({ sub: id, email: emailLower })
  return created({ token, user: safeUser(user) })
}

async function me(event) {
  const jwtPayload = requireAuth(event)
  if (!jwtPayload) return unauthorized()

  const user = await getItem(`USER#${jwtPayload.sub}`, 'PROFILE')
  if (!user) return unauthorized()

  return ok(safeUser(user))
}

async function updateProfile(event) {
  const jwtPayload = requireAuth(event)
  if (!jwtPayload) return unauthorized()

  const { phoneNumber } = parseBody(event)

  if (phoneNumber !== null && phoneNumber !== undefined) {
    if (typeof phoneNumber !== 'string' || !/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
      return badRequest('Voer een geldig telefoonnummer in E.164-formaat in (bijv. +31612345678)')
    }
  }

  await updateItem(`USER#${jwtPayload.sub}`, 'PROFILE', { phoneNumber: phoneNumber ?? null })
  const user = await getItem(`USER#${jwtPayload.sub}`, 'PROFILE')
  return ok(safeUser(user))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeUser(u) {
  // eslint-disable-next-line no-unused-vars
  const { PK, SK, GSI1PK, GSI1SK, passwordHash, ...rest } = u
  return rest
}

function requireAuth(event) {
  const token = extractBearer(event)
  if (!token) return null
  try {
    return verifyJwt(token)
  } catch {
    return null
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  process.env.TABLE_NAME = event.stageVariables?.tableName ?? process.env.TABLE_NAME ?? 'wdh-main'
  try {
    const method = event.httpMethod
    const path = event.path?.replace(/\/$/, '') // strip trailing slash

    if (method === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS' }, body: '' }

    if (method === 'POST'  && path === '/auth/login')    return await login(event)
    if (method === 'POST'  && path === '/auth/register') return await register(event)
    if (method === 'GET'   && path === '/auth/me')       return await me(event)
    if (method === 'PATCH' && path === '/auth/profile')  return await updateProfile(event)

    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Route niet gevonden' }) }
  } catch (err) {
    return serverError(err)
  }
}
