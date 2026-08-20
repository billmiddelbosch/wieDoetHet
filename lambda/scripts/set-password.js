/**
 * One-off script: set a User's password directly.
 *
 * There is no "forgot password" / reset-token flow in this project yet
 * (lambda/wiedoethet-auth/index.js only has login/register/me/updateProfile)
 * — this is the manual escape hatch, same pattern as scripts/set-admin-role.js.
 * Looks the user up by email via GSI1, hashes the new password with the same
 * scrypt helper login()/register() use, and overwrites `passwordHash`.
 *
 * Usage:
 *   TABLE_NAME=wdh-main NEW_PASSWORD='...' node scripts/set-password.js [email]
 *
 * The password is read from the NEW_PASSWORD env var rather than an argv
 * positional so it doesn't linger in shell history. Defaults to
 * b.middelbosch@bm-c.nl if no email is given. Requires AWS credentials for
 * the target account/region, same as any other AWS CLI/SDK call.
 */

import { queryGsi1, updateItem } from '../shared/db.js'
import { hashPassword } from '../shared/password.js'

const email = (process.argv[2] ?? 'b.middelbosch@bm-c.nl').toLowerCase()
const newPassword = process.env.NEW_PASSWORD

async function main() {
  if (!newPassword || newPassword.length < 8) {
    console.error('Set NEW_PASSWORD (min. 8 characters) in the environment before running this script.')
    process.exitCode = 1
    return
  }

  const [user] = await queryGsi1(`EMAIL#${email}`)
  if (!user) {
    console.error(`No User found for ${email}.`)
    process.exitCode = 1
    return
  }

  const passwordHash = await hashPassword(newPassword)
  await updateItem(user.PK, user.SK, { passwordHash })
  console.log(`Password updated for ${email} (${user.id}).`)
}

main().catch((err) => {
  console.error('Failed to set password:', err)
  process.exitCode = 1
})
