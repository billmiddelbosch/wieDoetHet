/**
 * DynamoDB DocumentClient (AWS SDK v3).
 *
 * Single-table design — table name from TABLE_NAME env var.
 *
 * Key schema
 * ──────────
 * Primary:  PK (string)  +  SK (string)
 * GSI1:     GSI1PK       +  GSI1SK       (index name: GSI1)
 * GSI2:     GSI2PK       +  GSI2SK       (index name: GSI2)
 * GSI3:     GSI3PK       +  GSI3SK       (index name: GSI3) — added for the
 *           Admin Section (wiedoethet-admin). GSI3PK is a constant per entity
 *           type ('USER' or 'GROUP'), GSI3SK is `{createdAt}#{id}`. Only User
 *           and Group items get a GSI3 partition — see lambda/DYNAMODB_SETUP.md.
 *
 * Entity key patterns
 * ───────────────────
 * User        PK=USER#{id}          SK=PROFILE
 *             GSI1PK=EMAIL#{email}  GSI1SK=USER
 *             GSI3PK=USER           GSI3SK={createdAt}#{id}
 *
 * Group       PK=GROUP#{id}              SK=METADATA
 *             GSI1PK=SHARE#{shareToken}  GSI1SK=GROUP
 *             GSI2PK=INITIATOR#{userId}  GSI2SK=GROUP#{id}
 *             GSI3PK=GROUP               GSI3SK={createdAt}#{id}
 *
 * Task        PK=GROUP#{groupId}   SK=TASK#{order:0>5}#{taskId}
 *
 * Claim       PK=TASK#{taskId}           SK=CLAIM#{claimId}
 *             GSI1PK=GCLAIM#{groupId}    GSI1SK={claimedAt}
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({})
export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
})

const table = () => process.env.TABLE_NAME ?? 'wdh-main'

// ─── Key builders ────────────────────────────────────────────────────────────

export const keys = {
  user: (id) => ({ PK: `USER#${id}`, SK: 'PROFILE' }),
  userByEmail: (email) => ({ GSI1PK: `EMAIL#${email}`, GSI1SK: 'USER' }),
  group: (id) => ({ PK: `GROUP#${id}`, SK: 'METADATA' }),
  groupByShareToken: (token) => ({ GSI1PK: `SHARE#${token}`, GSI1SK: 'GROUP' }),
  groupsByInitiator: (userId) => ({ GSI2PK: `INITIATOR#${userId}`, GSI2SK: `GROUP#` }),
  task: (groupId, order, taskId) => ({
    PK: `GROUP#${groupId}`,
    SK: `TASK#${String(order).padStart(5, '0')}#${taskId}`,
  }),
  tasksInGroup: (groupId) => ({ PK: `GROUP#${groupId}`, SKPrefix: 'TASK#' }),
  claim: (taskId, claimId) => ({ PK: `TASK#${taskId}`, SK: `CLAIM#${claimId}` }),
  claimsOnTask: (taskId) => ({ PK: `TASK#${taskId}`, SKPrefix: 'CLAIM#' }),
  claimsByGroup: (groupId) => ({ GSI1PK: `GCLAIM#${groupId}` }),
  // GSI3 — Admin Section (wiedoethet-admin): "list all users/groups" without a table Scan.
  userGsi3: (createdAt, id) => ({ GSI3PK: 'USER', GSI3SK: `${createdAt}#${id}` }),
  groupGsi3: (createdAt, id) => ({ GSI3PK: 'GROUP', GSI3SK: `${createdAt}#${id}` }),
}

// ─── Generic helpers ─────────────────────────────────────────────────────────

export async function getItem(pk, sk) {
  const { Item } = await ddb.send(new GetCommand({ TableName: table(), Key: { PK: pk, SK: sk } }))
  return Item ?? null
}

export async function putItem(item) {
  await ddb.send(new PutCommand({ TableName: table(), Item: item }))
  return item
}

export async function deleteItem(pk, sk) {
  await ddb.send(new DeleteCommand({ TableName: table(), Key: { PK: pk, SK: sk } }))
}

export async function updateItem(pk, sk, updates) {
  const expressions = []
  const names = {}
  const values = {}
  for (const [key, val] of Object.entries(updates)) {
    expressions.push(`#${key} = :${key}`)
    names[`#${key}`] = key
    values[`:${key}`] = val
  }
  await ddb.send(new UpdateCommand({
    TableName: table(),
    Key: { PK: pk, SK: sk },
    UpdateExpression: `SET ${expressions.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }))
}

export async function queryByPk(pk, skPrefix = null, indexName = null) {
  const params = {
    TableName: table(),
    KeyConditionExpression: skPrefix
      ? 'PK = :pk AND begins_with(SK, :prefix)'
      : 'PK = :pk',
    ExpressionAttributeValues: skPrefix
      ? { ':pk': pk, ':prefix': skPrefix }
      : { ':pk': pk },
  }
  if (indexName) {
    params.IndexName = indexName
    // For GSI queries PK key name differs — replace PK with the GSI key
    params.KeyConditionExpression = params.KeyConditionExpression.replace(/\bPK\b/g, indexName === 'GSI1' ? 'GSI1PK' : 'GSI2PK').replace(/\bSK\b/g, indexName === 'GSI1' ? 'GSI1SK' : 'GSI2SK')
  }
  const { Items } = await ddb.send(new QueryCommand(params))
  return Items ?? []
}

export async function queryGsi1(gsi1pk, gsi1skPrefix = null) {
  const params = {
    TableName: table(),
    IndexName: 'GSI1',
    KeyConditionExpression: gsi1skPrefix
      ? 'GSI1PK = :pk AND begins_with(GSI1SK, :prefix)'
      : 'GSI1PK = :pk',
    ExpressionAttributeValues: gsi1skPrefix
      ? { ':pk': gsi1pk, ':prefix': gsi1skPrefix }
      : { ':pk': gsi1pk },
  }
  const { Items } = await ddb.send(new QueryCommand(params))
  return Items ?? []
}

export async function queryGsi2(gsi2pk, gsi2skPrefix = null) {
  const params = {
    TableName: table(),
    IndexName: 'GSI2',
    KeyConditionExpression: gsi2skPrefix
      ? 'GSI2PK = :pk AND begins_with(GSI2SK, :prefix)'
      : 'GSI2PK = :pk',
    ExpressionAttributeValues: gsi2skPrefix
      ? { ':pk': gsi2pk, ':prefix': gsi2skPrefix }
      : { ':pk': gsi2pk },
  }
  const { Items } = await ddb.send(new QueryCommand(params))
  return Items ?? []
}

/**
 * Query GSI3 — "all items of one entity type" (Users or Groups), used only by
 * wiedoethet-admin. Deliberately richer than queryGsi1/queryGsi2: this is the
 * first caller that needs cursor pagination, sort direction, an optional
 * FilterExpression, and count-only queries, so it takes an options object and
 * returns { items, lastEvaluatedKey, count } instead of a bare array.
 *
 * Gotcha: FilterExpression is applied by DynamoDB AFTER it reads `limit` items
 * from the index, not after filtering — a filtered query can return fewer than
 * `limit` items even though more matches exist further in the index. Callers
 * that pass filterExpression must loop on a non-null lastEvaluatedKey rather
 * than treating `items.length < limit` as "no more pages".
 */
export async function queryGsi3(gsi3pk, {
  skGte,
  limit,
  exclusiveStartKey,
  scanIndexForward = true,
  filterExpression,
  expressionAttributeNames,
  expressionAttributeValues,
  select,
} = {}) {
  const names = { ...expressionAttributeNames }
  const values = { ':pk': gsi3pk, ...expressionAttributeValues }
  let keyCondition = 'GSI3PK = :pk'
  if (skGte !== undefined) {
    keyCondition += ' AND GSI3SK >= :skGte'
    values[':skGte'] = skGte
  }
  const params = {
    TableName: table(),
    IndexName: 'GSI3',
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: values,
    ScanIndexForward: scanIndexForward,
  }
  if (Object.keys(names).length) params.ExpressionAttributeNames = names
  if (limit !== undefined) params.Limit = limit
  if (exclusiveStartKey !== undefined) params.ExclusiveStartKey = exclusiveStartKey
  if (filterExpression) params.FilterExpression = filterExpression
  if (select) params.Select = select
  const { Items, LastEvaluatedKey, Count } = await ddb.send(new QueryCommand(params))
  return { items: Items ?? [], lastEvaluatedKey: LastEvaluatedKey ?? null, count: Count }
}
