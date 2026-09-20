/**
 * In-memory stand-in for shared/db.js — just enough of the single-table access
 * patterns the lifecycle Lambda uses, so the run can be tested end to end
 * without DynamoDB. Test-only.
 */

export function createFakeDb() {
  const items = new Map()
  const id = (pk, sk) => `${pk}||${sk}`
  const all = () => [...items.values()]

  const db = {
    items,
    async getItem(pk, sk) {
      return items.get(id(pk, sk)) ?? null
    },
    async putItem(item) {
      items.set(id(item.PK, item.SK), { ...item })
      return item
    },
    async putItemIfAbsent(item) {
      if (items.has(id(item.PK, item.SK))) return false
      items.set(id(item.PK, item.SK), { ...item })
      return true
    },
    async updateItem(pk, sk, updates) {
      const existing = items.get(id(pk, sk))
      if (!existing) throw new Error(`updateItem on missing ${pk}/${sk}`)
      Object.assign(existing, updates)
    },
    // Only the retry lock's condition is used: '#status = :expectedStatus AND #attempts = :seen'
    async updateItemIf(pk, sk, updates, _condition, values) {
      const existing = items.get(id(pk, sk))
      if (!existing) return false
      if (existing.status !== values[':expectedStatus'] || existing.attempts !== values[':seen']) return false
      Object.assign(existing, updates)
      return true
    },
    async queryByPk(pk, skPrefix = null) {
      return all().filter((i) => i.PK === pk && (!skPrefix || i.SK.startsWith(skPrefix)))
    },
    async queryGsi1(gsi1pk) {
      return all().filter((i) => i.GSI1PK === gsi1pk)
    },
    async queryGsi2(gsi2pk, prefix = null) {
      return all().filter((i) => i.GSI2PK === gsi2pk && (!prefix || i.GSI2SK.startsWith(prefix)))
    },
    async queryGsi3(partition, { skGte, scanIndexForward = true, limit = 100, exclusiveStartKey } = {}) {
      const rows = all().filter((i) => i.GSI3PK === partition && (skGte === undefined || i.GSI3SK >= skGte))
      rows.sort((a, b) => a.GSI3SK.localeCompare(b.GSI3SK))
      if (!scanIndexForward) rows.reverse()
      const start = exclusiveStartKey ? Number(exclusiveStartKey.offset) : 0
      const page = rows.slice(start, start + limit)
      const next = start + limit < rows.length ? { offset: start + limit } : null
      return { items: page, lastEvaluatedKey: next, count: page.length }
    },
  }

  // ─── Seed helpers ──────────────────────────────────────────────────────────
  db.addUser = (user) => {
    const item = {
      PK: `USER#${user.id}`,
      SK: 'PROFILE',
      GSI3PK: 'USER',
      GSI3SK: `${user.createdAt}#${user.id}`,
      name: 'Anna de Vries',
      email: `${user.id}@example.com`,
      ...user,
    }
    items.set(id(item.PK, item.SK), item)
    return item
  }
  db.addGroup = (group) => {
    const item = {
      PK: `GROUP#${group.id}`,
      SK: 'METADATA',
      GSI2PK: `INITIATOR#${group.initiatorId}`,
      GSI2SK: `GROUP#${group.id}`,
      GSI3PK: 'GROUP',
      GSI3SK: `${group.createdAt}#${group.id}`,
      name: 'Etentje',
      ...group,
    }
    items.set(id(item.PK, item.SK), item)
    return item
  }
  db.addTask = (groupId, taskId, extra = {}) => {
    const item = { PK: `GROUP#${groupId}`, SK: `TASK#00000#${taskId}`, id: taskId, groupId, title: 'Drinken', ...extra }
    items.set(id(item.PK, item.SK), item)
    return item
  }
  db.addClaim = (groupId, taskId, claimId = `c-${taskId}`) => {
    const item = { PK: `TASK#${taskId}`, SK: `CLAIM#${claimId}`, GSI1PK: `GCLAIM#${groupId}`, GSI1SK: '2026-01-01T00:00:00.000Z' }
    items.set(id(item.PK, item.SK), item)
    return item
  }
  db.enableTemplate = (templateId, extra = {}) => {
    const item = { PK: `MAILTPL#${templateId}`, SK: 'CONFIG', enabled: true, subject: null, bodyHtml: null, enabledAt: '2026-01-01T00:00:00.000Z', ...extra }
    items.set(id(item.PK, item.SK), item)
    return item
  }
  db.addLog = (row) => {
    const { scopeId = '-', ...rest } = row
    const item = {
      PK: `USER#${row.userId}`,
      SK: `MAIL#${row.templateId}#${scopeId}`,
      GSI3PK: 'MAILLOG',
      GSI3SK: `${row.createdAt}#${row.userId}#${row.templateId}`,
      type: 'MAILLOG',
      attempts: 1,
      errorMessage: null,
      sesMessageId: null,
      sentAt: row.status === 'sent' ? row.createdAt : null,
      ...rest,
    }
    items.set(id(item.PK, item.SK), item)
    return item
  }
  db.logRows = () => all().filter((i) => i.type === 'MAILLOG')
  db.logRow = (userId, templateId, scopeId = '-') => items.get(id(`USER#${userId}`, `MAIL#${templateId}#${scopeId}`)) ?? null
  db.lastRun = () => items.get(id('MAILSTATE#lifecycle', 'LASTRUN')) ?? null
  return db
}

export const ENV = {
  LIFECYCLE_MAIL_ENABLED: 'true',
  SES_FROM_EMAIL: 'noreply@wiedoethet.nl',
  SES_REPLY_TO_EMAIL: 'hallo@wiedoethet.nl',
}

/** A `deps` object for runLifecycle with a recording sendMail (`deps.sent`). */
export function makeDeps(db, { now, env = ENV, sendMail } = {}) {
  const sent = []
  return {
    db,
    now,
    env,
    sent,
    sendMail: sendMail ?? (async (message) => {
      sent.push(message)
      return { messageId: `msg-${sent.length}` }
    }),
  }
}

// Reference instants (Europe/Amsterdam summer time, UTC+2, September 2026):
export const TUE_10 = Date.parse('2026-09-22T08:00:00.000Z') // Tue 22 Sep 10:00 local
export const MON_10 = Date.parse('2026-09-21T08:00:00.000Z') // Mon 21 Sep 10:00 local
export const WED_10 = Date.parse('2026-09-23T08:00:00.000Z')
export const SAT_10 = Date.parse('2026-09-19T08:00:00.000Z')
export const hoursAgo = (from, hours) => new Date(from - hours * 3600 * 1000).toISOString()
export const daysAgo = (from, days) => hoursAgo(from, days * 24)
