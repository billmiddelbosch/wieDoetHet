import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock shared modules ───────────────────────────────────────────────────────

vi.mock('../../shared/db.js', () => ({
  getItem: vi.fn(),
  putItem: vi.fn(),
  deleteItem: vi.fn(),
  queryByPk: vi.fn(),
}))

vi.mock('../../shared/eventbridge.js', () => ({
  scheduleOneTimeRule: vi.fn(),
  deleteRule: vi.fn(),
}))

vi.mock('../../shared/jwt.js', () => ({
  verifyJwt: vi.fn(),
  signJwt: vi.fn(),
}))

import { handler } from '../index.js'
import { getItem, putItem, deleteItem, queryByPk } from '../../shared/db.js'
import { scheduleOneTimeRule, deleteRule } from '../../shared/eventbridge.js'
import { verifyJwt } from '../../shared/jwt.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FUTURE_ISO = new Date(Date.now() + 86_400_000).toISOString()
const USER_ID = 'user-abc'
const GROUP_ID = 'group-123'
const TASK_ID = 'task-456'

function makeEvent({ method, path, body = {}, token = 'valid-token' }) {
  return {
    httpMethod: method,
    path,
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    pathParameters: {},
    stageVariables: { tableName: 'wdh-test' },
  }
}

const mockGroup = {
  PK: `GROUP#${GROUP_ID}`,
  SK: 'METADATA',
  id: GROUP_ID,
  name: 'Test groep',
  shareToken: 'tok-abc123',
  initiatorId: USER_ID,
}

const mockTask = {
  PK: `GROUP#${GROUP_ID}`,
  SK: `TASK#00000#${TASK_ID}`,
  id: TASK_ID,
  groupId: GROUP_ID,
  title: 'Boodschappen',
  maxClaims: 2,
}

const mockReminder = {
  PK: `REMINDER#group#${GROUP_ID}`,
  SK: 'REMINDER',
  scope: 'group',
  scopeId: GROUP_ID,
  groupId: GROUP_ID,
  initiatorId: USER_ID,
  scheduledAt: FUTURE_ISO,
  ruleName: `wdh-reminder-group-${GROUP_ID}`,
  status: 'scheduled',
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyJwt.mockReturnValue({ sub: USER_ID, email: 'test@example.nl' })
  scheduleOneTimeRule.mockResolvedValue('arn:aws:events:...')
  deleteRule.mockResolvedValue()
  putItem.mockResolvedValue()
  deleteItem.mockResolvedValue()
})

// ─── POST /reminders ──────────────────────────────────────────────────────────

describe('POST /reminders', () => {
  it('returns 401 when no Authorization header', async () => {
    verifyJwt.mockImplementation(() => { throw new Error('No token') })
    const event = makeEvent({ method: 'POST', path: '/reminders', token: '' })
    event.headers = {}
    const res = await handler(event)
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when scope is missing', async () => {
    const res = await handler(makeEvent({
      method: 'POST', path: '/reminders',
      body: { id: GROUP_ID, scheduledAt: FUTURE_ISO },
    }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).message).toMatch(/scope/)
  })

  it('returns 400 when scope is invalid', async () => {
    const res = await handler(makeEvent({
      method: 'POST', path: '/reminders',
      body: { scope: 'invalid', id: GROUP_ID, scheduledAt: FUTURE_ISO },
    }))
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when id is missing', async () => {
    const res = await handler(makeEvent({
      method: 'POST', path: '/reminders',
      body: { scope: 'group', scheduledAt: FUTURE_ISO },
    }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).message).toMatch(/id/)
  })

  it('returns 400 when scheduledAt is missing', async () => {
    const res = await handler(makeEvent({
      method: 'POST', path: '/reminders',
      body: { scope: 'group', id: GROUP_ID },
    }))
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when scheduledAt is in the past', async () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const res = await handler(makeEvent({
      method: 'POST', path: '/reminders',
      body: { scope: 'group', id: GROUP_ID, scheduledAt: past },
    }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).message).toMatch(/toekomst/)
  })

  it('returns 400 when scheduledAt is not a valid date', async () => {
    const res = await handler(makeEvent({
      method: 'POST', path: '/reminders',
      body: { scope: 'group', id: GROUP_ID, scheduledAt: 'not-a-date' },
    }))
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 when group does not exist', async () => {
    getItem.mockResolvedValueOnce(null)
    const res = await handler(makeEvent({
      method: 'POST', path: '/reminders',
      body: { scope: 'group', id: GROUP_ID, scheduledAt: FUTURE_ISO },
    }))
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 when user is not the initiator', async () => {
    getItem.mockResolvedValueOnce({ ...mockGroup, initiatorId: 'other-user' })
    const res = await handler(makeEvent({
      method: 'POST', path: '/reminders',
      body: { scope: 'group', id: GROUP_ID, scheduledAt: FUTURE_ISO },
    }))
    expect(res.statusCode).toBe(403)
  })

  it('creates a group reminder and returns 201', async () => {
    getItem
      .mockResolvedValueOnce(mockGroup)   // group ownership check
      .mockResolvedValueOnce(null)         // no existing reminder

    const res = await handler(makeEvent({
      method: 'POST', path: '/reminders',
      body: { scope: 'group', id: GROUP_ID, scheduledAt: FUTURE_ISO },
    }))

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.scope).toBe('group')
    expect(body.status).toBe('scheduled')
    expect(scheduleOneTimeRule).toHaveBeenCalledOnce()
    expect(putItem).toHaveBeenCalledOnce()
  })

  it('deletes existing EventBridge rule before creating new one (idempotent update)', async () => {
    getItem
      .mockResolvedValueOnce(mockGroup)
      .mockResolvedValueOnce(mockReminder) // existing reminder

    await handler(makeEvent({
      method: 'POST', path: '/reminders',
      body: { scope: 'group', id: GROUP_ID, scheduledAt: FUTURE_ISO },
    }))

    expect(deleteRule).toHaveBeenCalledWith(mockReminder.ruleName)
    expect(scheduleOneTimeRule).toHaveBeenCalledOnce()
  })

  it('returns 400 when task scope is missing groupId', async () => {
    const res = await handler(makeEvent({
      method: 'POST', path: '/reminders',
      body: { scope: 'task', id: TASK_ID, scheduledAt: FUTURE_ISO },
    }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).message).toMatch(/groupId/)
  })

  it('creates a task reminder and returns 201', async () => {
    getItem
      .mockResolvedValueOnce(mockGroup)   // group ownership check
      .mockResolvedValueOnce(null)         // no existing reminder
    queryByPk.mockResolvedValueOnce([mockTask]) // task lookup

    const res = await handler(makeEvent({
      method: 'POST', path: '/reminders',
      body: { scope: 'task', id: TASK_ID, scheduledAt: FUTURE_ISO, groupId: GROUP_ID },
    }))

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.scope).toBe('task')
  })

  it('returns 404 when task does not exist in the group', async () => {
    getItem.mockResolvedValueOnce(mockGroup)
    queryByPk.mockResolvedValueOnce([]) // no tasks found

    const res = await handler(makeEvent({
      method: 'POST', path: '/reminders',
      body: { scope: 'task', id: 'nonexistent-task', scheduledAt: FUTURE_ISO, groupId: GROUP_ID },
    }))

    expect(res.statusCode).toBe(404)
  })
})

// ─── GET /reminders/{scope}/{id} ──────────────────────────────────────────────

describe('GET /reminders/{scope}/{id}', () => {
  it('returns 401 when unauthenticated', async () => {
    verifyJwt.mockImplementation(() => { throw new Error() })
    const event = makeEvent({ method: 'GET', path: `/reminders/group/${GROUP_ID}`, token: '' })
    event.headers = {}
    const res = await handler(event)
    expect(res.statusCode).toBe(401)
  })

  it('returns { status: "none" } when no reminder exists', async () => {
    getItem.mockResolvedValueOnce(null)
    const res = await handler(makeEvent({ method: 'GET', path: `/reminders/group/${GROUP_ID}` }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('none')
    expect(body.scheduledAt).toBeNull()
  })

  it('returns reminder when it exists and user owns it', async () => {
    getItem.mockResolvedValueOnce(mockReminder)
    const res = await handler(makeEvent({ method: 'GET', path: `/reminders/group/${GROUP_ID}` }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('scheduled')
    expect(body.scope).toBe('group')
  })

  it('returns 403 when user does not own the reminder', async () => {
    getItem.mockResolvedValueOnce({ ...mockReminder, initiatorId: 'other-user' })
    const res = await handler(makeEvent({ method: 'GET', path: `/reminders/group/${GROUP_ID}` }))
    expect(res.statusCode).toBe(403)
  })

  it('strips DynamoDB key fields from the response', async () => {
    getItem.mockResolvedValueOnce(mockReminder)
    const res = await handler(makeEvent({ method: 'GET', path: `/reminders/group/${GROUP_ID}` }))
    const body = JSON.parse(res.body)
    expect(body).not.toHaveProperty('PK')
    expect(body).not.toHaveProperty('SK')
    expect(body).not.toHaveProperty('GSI1PK')
    expect(body).not.toHaveProperty('GSI1SK')
  })
})

// ─── DELETE /reminders/{scope}/{id} ──────────────────────────────────────────

describe('DELETE /reminders/{scope}/{id}', () => {
  it('returns 401 when unauthenticated', async () => {
    verifyJwt.mockImplementation(() => { throw new Error() })
    const event = makeEvent({ method: 'DELETE', path: `/reminders/group/${GROUP_ID}`, token: '' })
    event.headers = {}
    const res = await handler(event)
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 when reminder does not exist', async () => {
    getItem.mockResolvedValueOnce(null)
    const res = await handler(makeEvent({ method: 'DELETE', path: `/reminders/group/${GROUP_ID}` }))
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 when user does not own the reminder', async () => {
    getItem.mockResolvedValueOnce({ ...mockReminder, initiatorId: 'other-user' })
    const res = await handler(makeEvent({ method: 'DELETE', path: `/reminders/group/${GROUP_ID}` }))
    expect(res.statusCode).toBe(403)
  })

  it('deletes EventBridge rule and DynamoDB record, returns 204', async () => {
    getItem.mockResolvedValueOnce(mockReminder)
    const res = await handler(makeEvent({ method: 'DELETE', path: `/reminders/group/${GROUP_ID}` }))
    expect(res.statusCode).toBe(204)
    expect(deleteRule).toHaveBeenCalledWith(mockReminder.ruleName)
    expect(deleteItem).toHaveBeenCalledWith(`REMINDER#group#${GROUP_ID}`, 'REMINDER')
  })
})

// ─── OPTIONS (CORS preflight) ─────────────────────────────────────────────────

describe('OPTIONS /reminders', () => {
  it('returns 204 with CORS headers', async () => {
    const res = await handler(makeEvent({ method: 'OPTIONS', path: '/reminders' }))
    expect(res.statusCode).toBe(204)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*')
  })
})

// ─── Unknown route ────────────────────────────────────────────────────────────

describe('Unknown route', () => {
  it('returns 404 for unrecognised path', async () => {
    const res = await handler(makeEvent({ method: 'GET', path: '/reminders/unknown-scope/x' }))
    expect(res.statusCode).toBe(404)
  })
})
