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
 *
 * Entity key patterns
 * ───────────────────
 * User        PK=USER#{id}          SK=PROFILE
 *             GSI1PK=EMAIL#{email}  GSI1SK=USER
 *
 * Group       PK=GROUP#{id}              SK=METADATA
 *             GSI1PK=SHARE#{shareToken}  GSI1SK=GROUP
 *             GSI2PK=INITIATOR#{userId}  GSI2SK=GROUP#{id}
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
