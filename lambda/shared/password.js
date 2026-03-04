/**
 * Password hashing using Node.js 24 built-in crypto.scrypt.
 * No external dependencies required.
 *
 * Hash format: "<hex-salt>:<hex-derived-key>"
 */

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const SALT_BYTES = 16
const KEY_LEN = 64
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 }

/**
 * Hash a plain-text password.
 * @param {string} password
 * @returns {Promise<string>} stored hash string
 */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES).toString('hex')
  const key = await scryptAsync(password, salt, KEY_LEN, SCRYPT_PARAMS)
  return `${salt}:${key.toString('hex')}`
}

/**
 * Verify a plain-text password against a stored hash.
 * @param {string} password
 * @param {string} hash — value previously returned by hashPassword()
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, hash) {
  const [salt, storedKey] = hash.split(':')
  const key = await scryptAsync(password, salt, KEY_LEN, SCRYPT_PARAMS)
  return timingSafeEqual(Buffer.from(storedKey, 'hex'), key)
}
