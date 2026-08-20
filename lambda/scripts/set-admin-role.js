/**
 * One-off script: grant a User the 'admin' role.
 *
 * There is no promote-to-admin route (deliberately out of scope for v1, see
 * product/specs/admin-api.spec.md) — this is the manual escape hatch.
 * Looks the user up by email via GSI1 (same lookup wiedoethet-auth's login()
 * uses), then flips their `role` field to 'admin' via UpdateItem.
 *
 * Usage:
 *   TABLE_NAME=wdh-main node scripts/set-admin-role.js [email]
 *
 * If no email is given, defaults to the account requested for this project's
 * admin CRM testing. Requires AWS credentials for the target account/region
 * to be resolvable via the standard AWS SDK credential chain (env vars,
 * ~/.aws/credentials profile, etc.) — same as any other AWS CLI/SDK call.
 */

import { queryGsi1, updateItem } from '../shared/db.js'

const email = (process.argv[2] ?? 'b.middelbosch@bm-c.nl').toLowerCase()

async function main() {
  const [user] = await queryGsi1(`EMAIL#${email}`)

  if (!user) {
    console.error(`No User found for ${email} — they must register first.`)
    process.exitCode = 1
    return
  }

  if (user.role === 'admin') {
    console.log(`${email} (${user.id}) is already an admin. No change made.`)
    return
  }

  await updateItem(user.PK, user.SK, { role: 'admin' })
  console.log(`${email} (${user.id}) is now an admin.`)
}

main().catch((err) => {
  console.error('Failed to set admin role:', err)
  process.exitCode = 1
})
