/**
 * One-off script: backfill GSI3PK/GSI3SK onto User and Group items that
 * predate the Admin Section feature (see product/specs/admin-api.spec.md,
 * Acceptance Criterion 15 / Known Limitations).
 *
 * wiedoethet-auth's register() and wiedoethet-groups' createGroup() only
 * started writing GSI3PK/GSI3SK once the Admin Section shipped — any
 * User/Group created before that has no GSI3 partition and is invisible to
 * GET /admin/users, /admin/groups, and /admin/stats (which all Query GSI3 to
 * avoid a table Scan on every request). This script is the one-time fix: it
 * Scans the base table once (acceptable here — a one-off maintenance script,
 * not the request-serving read path the "no Scan" rule in
 * admin-api.spec.md targets), finds every User (SK=PROFILE) and Group
 * (SK=METADATA) item missing GSI3PK, and UpdateItems it using the same
 * keys.userGsi3()/keys.groupGsi3() builders the write paths already use.
 *
 * Usage:
 *   TABLE_NAME=wdh-dev node scripts/backfill-gsi3.js
 *   TABLE_NAME=wdh-dev DRY_RUN=1 node scripts/backfill-gsi3.js   # preview only, no writes
 *
 * Requires AWS credentials for the target account/region to be resolvable
 * via the standard AWS SDK credential chain, same as any other AWS CLI/SDK
 * call in this repo.
 */

import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, keys, updateItem } from '../shared/db.js'

const TABLE_NAME = process.env.TABLE_NAME ?? 'wdh-main'
const dryRun = process.env.DRY_RUN === '1'

async function* scanMissingGsi3() {
  let exclusiveStartKey
  do {
    const { Items, LastEvaluatedKey } = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: '(SK = :profile OR SK = :metadata) AND attribute_not_exists(GSI3PK)',
      ExpressionAttributeValues: { ':profile': 'PROFILE', ':metadata': 'METADATA' },
      ExclusiveStartKey: exclusiveStartKey,
    }))
    for (const item of Items ?? []) yield item
    exclusiveStartKey = LastEvaluatedKey
  } while (exclusiveStartKey)
}

async function main() {
  console.log(`Scanning ${TABLE_NAME} for User/Group items missing GSI3PK/GSI3SK...${dryRun ? ' (dry run)' : ''}`)

  let usersFixed = 0
  let groupsFixed = 0
  let skipped = 0

  for await (const item of scanMissingGsi3()) {
    const isUser = item.SK === 'PROFILE' && item.PK?.startsWith('USER#')
    const isGroup = item.SK === 'METADATA' && item.PK?.startsWith('GROUP#')

    if (!isUser && !isGroup) {
      skipped++
      continue
    }
    if (!item.id || !item.createdAt) {
      console.warn(`Skipping ${item.PK} — missing id/createdAt, cannot compute GSI3SK.`)
      skipped++
      continue
    }

    const gsi3Keys = isUser ? keys.userGsi3(item.createdAt, item.id) : keys.groupGsi3(item.createdAt, item.id)

    if (dryRun) {
      console.log(`[dry run] would backfill ${item.PK} ->`, gsi3Keys)
    } else {
      await updateItem(item.PK, item.SK, gsi3Keys)
      console.log(`Backfilled ${item.PK} ->`, gsi3Keys)
    }

    if (isUser) usersFixed++
    else groupsFixed++
  }

  console.log(
    `\nDone. Users backfilled: ${usersFixed}, Groups backfilled: ${groupsFixed}, skipped: ${skipped}.` +
      (dryRun ? ' (dry run — no writes made)' : ''),
  )
}

main().catch((err) => {
  console.error('Backfill failed:', err)
  process.exitCode = 1
})
