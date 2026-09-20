// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The admin Lambda talks to DynamoDB/SES/JWT through shared/ modules — swap those three for fakes.
const store = new Map()
const id = (pk, sk) => `${pk}||${sk}`
const gsi3Rows = { MAILLOG: [], USER: [] }
const gsi3Calls = []
const sendMail = vi.fn()

vi.mock('../../shared/db.js', async (importActual) => {
  const actual = await importActual()
  return {
    ...actual,
    getItem: async (pk, sk) => store.get(id(pk, sk)) ?? null,
    updateItem: async (pk, sk, updates) => {
      store.set(id(pk, sk), { ...(store.get(id(pk, sk)) ?? { PK: pk, SK: sk }), ...updates })
    },
    queryByPk: async () => [],
    queryGsi1: async () => [],
    queryGsi2: async () => [],
    queryGsi3: async (partition, options = {}) => {
      gsi3Calls.push({ partition, options })
      const rows = gsi3Rows[partition] ?? []
      const start = options.exclusiveStartKey ? Number(options.exclusiveStartKey.offset) : 0
      const page = rows.slice(start, start + (options.limit ?? rows.length))
      const next = start + page.length < rows.length ? { offset: start + page.length } : null
      return { items: page, lastEvaluatedKey: next, count: page.length }
    },
  }
})
vi.mock('../../shared/ses.js', () => ({ sendMail: (...args) => sendMail(...args) }))
vi.mock('../../shared/jwt.js', () => ({ verifyJwt: () => ({ sub: 'admin-1' }) }))

const { handler } = await import('../index.js')

const call = (method, path, { body, query, pathParameters } = {}) =>
  handler({
    httpMethod: method,
    path,
    headers: { Authorization: 'Bearer test' },
    body: body === undefined ? null : JSON.stringify(body),
    queryStringParameters: query ?? null,
    pathParameters: pathParameters ?? null,
  }).then((res) => ({ status: res.statusCode, json: res.body ? JSON.parse(res.body) : null }))

const seedUser = (extra = {}) => {
  const user = { PK: `USER#${extra.id}`, SK: 'PROFILE', name: 'Anna de Vries', email: `${extra.id}@example.com`, createdAt: '2026-09-01T00:00:00.000Z', ...extra }
  store.set(id(user.PK, 'PROFILE'), user)
  return user
}

beforeEach(() => {
  store.clear()
  gsi3Rows.MAILLOG = []
  gsi3Rows.USER = []
  gsi3Calls.length = 0
  sendMail.mockReset().mockResolvedValue({ messageId: 'm-1' })
  process.env.SES_REPLY_TO_EMAIL = 'hallo@wiedoethet.nl'
  process.env.SES_FROM_EMAIL = 'noreply@wiedoethet.nl'
  seedUser({ id: 'admin-1', role: 'admin', name: 'Bea Admin', email: 'admin@example.com' })
})

describe('auth', () => {
  it('rejects a non-admin with 403 on every new route', async () => {
    seedUser({ id: 'admin-1', role: 'user' })
    for (const [method, path] of [
      ['GET', '/admin/mail-templates'],
      ['PATCH', '/admin/mail-templates/welcome'],
      ['POST', '/admin/mail-templates/welcome/test'],
      ['GET', '/admin/mail-log'],
      ['PATCH', '/admin/users/u1/mail-opt-out'],
    ]) {
      expect((await call(method, path, { body: {} })).status, `${method} ${path}`).toBe(403)
    }
  })
})

describe('GET /admin/mail-templates', () => {
  it('lists all seven templates in priority order, disabled and default when never configured', async () => {
    const { status, json } = await call('GET', '/admin/mail-templates')
    expect(status).toBe(200)
    expect(json.items.map((t) => t.id)).toEqual(['welcome', 'no_group', 'no_tasks', 'no_claims', 'day_after_event', 'dormant_30', 'dormant_60'])
    expect(json.items.every((t) => t.enabled === false && t.isCustomised === false)).toBe(true)
    expect(json.items[0]).toMatchObject({ scope: 'user', tier: 'timely', subject: json.items[0].defaultSubject })
    expect(json.items[2].variables).toContain('groupName')
    expect(json.lastRun).toBeNull()
  })

  it('merges a stored override and reports the last run', async () => {
    store.set(id('MAILTPL#welcome', 'CONFIG'), { enabled: true, subject: 'Hoi!', bodyHtml: null, updatedAt: '2026-09-10T00:00:00.000Z', updatedBy: 'admin-1' })
    store.set(id('MAILSTATE#lifecycle', 'LASTRUN'), { at: '2026-09-18T08:00:00.000Z', masterEnabled: true, dryRun: false, evaluated: 12, sent: 3, failed: 1, skippedByCap: 0 })
    const { json } = await call('GET', '/admin/mail-templates')
    expect(json.items[0]).toMatchObject({ enabled: true, subject: 'Hoi!', isCustomised: true, updatedBy: 'admin-1' })
    expect(json.items[0].bodyHtml).toBe(json.items[0].defaultBodyHtml)
    expect(json.lastRun).toEqual({ at: '2026-09-18T08:00:00.000Z', masterEnabled: true, dryRun: false, evaluated: 12, sent: 3, failed: 1, skippedByCap: 0 })
  })
})

describe('PATCH /admin/mail-templates/{id}', () => {
  const patch = (templateId, body) => call('PATCH', `/admin/mail-templates/${templateId}`, { body, pathParameters: { templateId } })

  it('404s an unknown template and 400s an empty body', async () => {
    expect((await patch('nope', { enabled: true })).status).toBe(404)
    expect((await patch('welcome', {})).status).toBe(400)
  })

  it('validates enabled, subject, body and placeholders', async () => {
    expect((await patch('welcome', { enabled: 'yes' })).status).toBe(400)
    expect((await patch('welcome', { subject: '   ' })).status).toBe(400)
    expect((await patch('welcome', { subject: 'x'.repeat(151) })).status).toBe(400)
    expect((await patch('welcome', { bodyHtml: '<p></p>' })).status).toBe(400)
    const unknown = await patch('welcome', { bodyHtml: '<p>Groep {{groupName}}</p>' }) // groupName is not a user-template variable
    expect(unknown.status).toBe(400)
    expect(unknown.json.message).toBe('Onbekend of niet toegestaan veld: {{groupName}}')
    expect(store.has(id('MAILTPL#welcome', 'CONFIG'))).toBe(false)
  })

  it('enables a template, stamping enabledAt only on the false -> true flip', async () => {
    const first = await patch('welcome', { enabled: true })
    expect(first.status).toBe(200)
    expect(first.json).toMatchObject({ id: 'welcome', enabled: true, isCustomised: false, updatedBy: 'admin-1' })
    const stamped = store.get(id('MAILTPL#welcome', 'CONFIG')).enabledAt
    expect(stamped).toEqual(expect.any(String))

    await patch('welcome', { enabled: true }) // already on: keep the original stamp
    expect(store.get(id('MAILTPL#welcome', 'CONFIG')).enabledAt).toBe(stamped)

    await patch('welcome', { enabled: false }) // true -> false leaves it
    expect(store.get(id('MAILTPL#welcome', 'CONFIG')).enabledAt).toBe(stamped)
  })

  it('stores overrides, keeps them across an enabled-only patch, and null resets to the default', async () => {
    const saved = await patch('no_tasks', { subject: '  Taken voor {{groupName}}  ', bodyHtml: '<p>Hoi {{firstName}}, ga naar {{groupUrl}}</p>' })
    expect(saved.json).toMatchObject({ subject: 'Taken voor {{groupName}}', bodyHtml: '<p>Hoi {{firstName}}, ga naar {{groupUrl}}</p>', isCustomised: true })

    const toggled = await patch('no_tasks', { enabled: true })
    expect(toggled.json).toMatchObject({ subject: 'Taken voor {{groupName}}', isCustomised: true })

    const reset = await patch('no_tasks', { subject: null, bodyHtml: null })
    expect(reset.json).toMatchObject({ isCustomised: false })
    expect(reset.json.subject).toBe(reset.json.defaultSubject)
    expect(reset.json.bodyHtml).toBe(reset.json.defaultBodyHtml)
  })
})

describe('POST /admin/mail-templates/{id}/test', () => {
  const test = (templateId) => call('POST', `/admin/mail-templates/${templateId}/test`, { pathParameters: { templateId } })

  it('404s an unknown template', async () => {
    expect((await test('nope')).status).toBe(404)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('sends a [TEST] mail with sample values and the footer to the calling admin only', async () => {
    const { status, json } = await test('no_tasks')
    expect(status).toBe(200)
    expect(json).toEqual({ sent: true, to: 'admin@example.com' })
    expect(sendMail).toHaveBeenCalledTimes(1)
    const message = sendMail.mock.calls[0][0]
    expect(message.to).toBe('admin@example.com')
    expect(message.subject).toBe('[TEST] Bijna klaar: voeg taken toe aan Voorbeeldgroep')
    expect(message.html).toContain('Hoi Bea')
    expect(message.html).toContain('/dashboard')
    expect(message.html).toContain('afmelden') // opt-out footer
    expect(message.html).not.toContain('{{')
    expect([...store.keys()].some((key) => key.includes('MAIL#'))).toBe(false) // not logged
  })

  it('uses the stored override text', async () => {
    store.set(id('MAILTPL#welcome', 'CONFIG'), { enabled: false, subject: 'Aangepast {{firstName}}', bodyHtml: '<p>Eigen tekst</p>' })
    await test('welcome')
    expect(sendMail.mock.calls[0][0]).toMatchObject({ subject: '[TEST] Aangepast Bea' })
    expect(sendMail.mock.calls[0][0].html).toContain('Eigen tekst')
  })

  it('answers 502 with the error when SES fails', async () => {
    sendMail.mockRejectedValue(new Error('Email address is not verified'))
    const { status, json } = await test('welcome')
    expect(status).toBe(502)
    expect(json.message).toContain('Email address is not verified')
  })
})

describe('GET /admin/mail-log', () => {
  const row = (n, extra = {}) => ({
    PK: `USER#u${n}`, SK: 'MAIL#welcome#-', GSI3PK: 'MAILLOG', GSI3SK: `2026-09-1${n}T08:00:00.000Z#u${n}#welcome`, type: 'MAILLOG',
    id: `welcome:u${n}:-`, templateId: 'welcome', userId: `u${n}`, email: `u${n}@example.com`, status: 'sent', ...extra,
  })

  it('returns entries newest-first without the key attributes, with a cursor when there is more', async () => {
    gsi3Rows.MAILLOG = [row(3), row(2), row(1)]
    const { status, json } = await call('GET', '/admin/mail-log', { query: { limit: '2' } })
    expect(status).toBe(200)
    expect(json.items).toHaveLength(2)
    expect(json.items[0]).not.toHaveProperty('PK')
    expect(json.items[0]).not.toHaveProperty('GSI3SK')
    expect(json.items[0]).not.toHaveProperty('type')
    expect(json.items[0]).toMatchObject({ templateId: 'welcome', userId: 'u3', status: 'sent' })
    expect(typeof json.nextCursor).toBe('string')
    expect(gsi3Calls[0].options.scanIndexForward).toBe(false)

    const page2 = await call('GET', '/admin/mail-log', { query: { limit: '2', cursor: json.nextCursor } })
    expect(page2.json.items).toHaveLength(1)
    expect(page2.json.nextCursor).toBeNull()
  })

  it('builds a filter from templateId, status and q (case-insensitive) and reads bigger pages when filtering', async () => {
    gsi3Rows.MAILLOG = [row(1)]
    await call('GET', '/admin/mail-log', { query: { templateId: 'welcome', status: 'failed', q: 'ANNA@' } })
    const { options } = gsi3Calls[0]
    expect(options.filterExpression).toBe('templateId = :templateId AND #status = :status AND contains(email, :q)')
    expect(options.expressionAttributeValues).toEqual({ ':templateId': 'welcome', ':status': 'failed', ':q': 'anna@' })
    expect(options.expressionAttributeNames).toEqual({ '#status': 'status' })
    expect(options.limit).toBe(100)
  })

  it('400s bad params', async () => {
    for (const query of [{ templateId: 'nope' }, { status: 'bounced' }, { limit: '0' }, { limit: '51' }, { limit: 'abc' }, { cursor: '@@@' }]) {
      expect((await call('GET', '/admin/mail-log', { query })).status, JSON.stringify(query)).toBe(400)
    }
  })
})

describe('PATCH /admin/users/{id}/mail-opt-out', () => {
  const setOptOut = (userId, body) => call('PATCH', `/admin/users/${userId}/mail-opt-out`, { body, pathParameters: { userId } })

  it('400s a non-boolean, 404s an unknown user', async () => {
    seedUser({ id: 'u1' })
    expect((await setOptOut('u1', { optOut: 'yes' })).status).toBe(400)
    expect((await setOptOut('u1', {})).status).toBe(400)
    expect((await setOptOut('ghost', { optOut: true })).status).toBe(404)
  })

  it('opts a user out and back in, recording who did it', async () => {
    seedUser({ id: 'u1' })
    const out = await setOptOut('u1', { optOut: true })
    expect(out.status).toBe(200)
    expect(out.json).toMatchObject({ id: 'u1', mailOptOut: true })
    expect(out.json.mailOptOutAt).toEqual(expect.any(String))
    expect(store.get(id('USER#u1', 'PROFILE'))).toMatchObject({ mailOptOut: true, mailOptOutBy: 'admin-1' })

    const back = await setOptOut('u1', { optOut: false })
    expect(back.json).toEqual({ id: 'u1', mailOptOut: false, mailOptOutAt: null })
  })

  it('is idempotent — repeating keeps the original timestamp', async () => {
    seedUser({ id: 'u1', mailOptOut: true, mailOptOutAt: '2026-09-01T10:00:00.000Z' })
    const again = await setOptOut('u1', { optOut: true })
    expect(again.json).toEqual({ id: 'u1', mailOptOut: true, mailOptOutAt: '2026-09-01T10:00:00.000Z' })
  })
})

describe('existing endpoints', () => {
  it('GET /admin/users/{id} exposes mailOptOut, mailOptOutAt and lastSeenAt (absent => false / null)', async () => {
    seedUser({ id: 'u1' })
    seedUser({ id: 'u2', mailOptOut: true, mailOptOutAt: '2026-09-05T00:00:00.000Z', lastSeenAt: '2026-09-17T00:00:00.000Z' })
    const plain = await call('GET', '/admin/users/u1', { pathParameters: { userId: 'u1' } })
    expect(plain.json).toMatchObject({ mailOptOut: false, mailOptOutAt: null, lastSeenAt: null })
    const opted = await call('GET', '/admin/users/u2', { pathParameters: { userId: 'u2' } })
    expect(opted.json).toMatchObject({ mailOptOut: true, mailOptOutAt: '2026-09-05T00:00:00.000Z', lastSeenAt: '2026-09-17T00:00:00.000Z' })
  })

  it('GET /admin/users rows carry mailOptOut', async () => {
    gsi3Rows.USER = [seedUser({ id: 'u2', mailOptOut: true }), seedUser({ id: 'u1' })]
    const { json } = await call('GET', '/admin/users')
    expect(json.items.map((u) => [u.id, u.mailOptOut])).toEqual([['u2', true], ['u1', false]])
  })
})

describe('POST /admin/mail', () => {
  const mail = (body) => call('POST', '/admin/mail', { body: { subject: 'Nieuws', html: '<p>Hallo</p>', ...body } })

  it('skips opted-out users and reports skippedOptOut', async () => {
    seedUser({ id: 'u1' })
    seedUser({ id: 'u2', mailOptOut: true })
    const { status, json } = await mail({ userIds: ['u1', 'u2'] })
    expect(status).toBe(200)
    expect(json).toEqual({ sent: 1, failed: 0, failures: [], skippedOptOut: 1 })
    expect(sendMail.mock.calls.map(([m]) => m.to)).toEqual(['u1@example.com'])
    expect(sendMail.mock.calls[0][0].html).toContain('afmelden') // footer on manual mails too
  })

  it('answers 200 (not 400) when everyone opted out', async () => {
    seedUser({ id: 'u2', mailOptOut: true })
    const { status, json } = await mail({ userIds: ['u2'] })
    expect(status).toBe(200)
    expect(json).toEqual({ sent: 0, failed: 0, failures: [], skippedOptOut: 1 })
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('reports skippedOptOut: 0 when nobody is opted out', async () => {
    seedUser({ id: 'u1' })
    expect((await mail({ userIds: ['u1'] })).json.skippedOptOut).toBe(0)
  })

  it('applies the recipient cap to the sendable set, not the opted-out ones', async () => {
    const ids = Array.from({ length: 502 }, (_, i) => `b${i}`)
    ids.forEach((userId, i) => seedUser({ id: userId, mailOptOut: i < 3 })) // 499 sendable
    const { status, json } = await mail({ userIds: ids })
    expect(status).toBe(200)
    expect(json).toMatchObject({ sent: 499, skippedOptOut: 3 })
  })

  it('still 400s when the sendable set is over the cap', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `c${i}`)
    ids.forEach((userId) => seedUser({ id: userId }))
    expect((await mail({ userIds: ids })).status).toBe(400)
  })

  it('fails closed (500, nothing sent) when SES_REPLY_TO_EMAIL is not configured', async () => {
    seedUser({ id: 'u1' })
    delete process.env.SES_REPLY_TO_EMAIL
    const { status } = await mail({ userIds: ['u1'] })
    expect(status).toBe(500)
    expect(sendMail).not.toHaveBeenCalled()
  })
})
