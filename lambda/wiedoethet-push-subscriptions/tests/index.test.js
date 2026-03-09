import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock shared modules ───────────────────────────────────────────────────────

vi.mock('../../shared/db.js', () => ({
  getItem: vi.fn(),
  putItem: vi.fn(),
  deleteItem: vi.fn(),
}))

vi.mock('../../shared/jwt.js', () => ({
  verifyJwt: vi.fn(),
}))

import { handler } from '../index.js'
import { getItem, putItem, deleteItem } from '../../shared/db.js'
import { verifyJwt } from '../../shared/jwt.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc'

const mockSub = {
  endpoint: 'https://push.example.com/sub-123',
  keys: { p256dh: 'key-p256dh', auth: 'key-auth' },
}

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

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TABLE_NAME = 'wdh-test'
  // Default: verifyJwt returns a valid user payload
  verifyJwt.mockReturnValue({ sub: USER_ID })
  putItem.mockResolvedValue({})
  deleteItem.mockResolvedValue({})
})

// ─── CORS preflight ───────────────────────────────────────────────────────────

describe('OPTIONS preflight', () => {
  it('returns 204 with CORS headers', async () => {
    const res = await handler(makeEvent({ method: 'OPTIONS', path: '/push-subscriptions' }))
    expect(res.statusCode).toBe(204)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*')
  })
})

// ─── Auth guard ───────────────────────────────────────────────────────────────

describe('auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const event = makeEvent({ method: 'POST', path: '/push-subscriptions', body: mockSub })
    event.headers = {}
    const res = await handler(event)
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when JWT verification throws', async () => {
    verifyJwt.mockImplementationOnce(() => { throw new Error('invalid token') })
    const res = await handler(makeEvent({ method: 'POST', path: '/push-subscriptions', body: mockSub }))
    expect(res.statusCode).toBe(401)
  })
})

// ─── POST /push-subscriptions ─────────────────────────────────────────────────

describe('POST /push-subscriptions', () => {
  it('saves subscription and returns 201', async () => {
    const res = await handler(makeEvent({
      method: 'POST',
      path: '/push-subscriptions',
      body: mockSub,
    }))

    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
    expect(putItem).toHaveBeenCalledWith(
      expect.objectContaining({
        PK: `PUSH_SUB#${USER_ID}`,
        SK: 'PUSH_SUB',
        endpoint: mockSub.endpoint,
        keys: mockSub.keys,
        userId: USER_ID,
      })
    )
  })

  it('includes createdAt timestamp in persisted item', async () => {
    await handler(makeEvent({
      method: 'POST',
      path: '/push-subscriptions',
      body: mockSub,
    }))

    const savedItem = putItem.mock.calls[0][0]
    expect(savedItem.createdAt).toBeDefined()
    expect(() => new Date(savedItem.createdAt)).not.toThrow()
  })

  it('overwrites existing subscription (idempotent PUT)', async () => {
    // Call twice — both should succeed (no uniqueness check)
    await handler(makeEvent({ method: 'POST', path: '/push-subscriptions', body: mockSub }))
    await handler(makeEvent({ method: 'POST', path: '/push-subscriptions', body: mockSub }))

    expect(putItem).toHaveBeenCalledTimes(2)
    // Both calls use the same PK — idempotent overwrite
    expect(putItem.mock.calls[0][0].PK).toBe(`PUSH_SUB#${USER_ID}`)
    expect(putItem.mock.calls[1][0].PK).toBe(`PUSH_SUB#${USER_ID}`)
  })

  it('returns 400 when endpoint is missing', async () => {
    const res = await handler(makeEvent({
      method: 'POST',
      path: '/push-subscriptions',
      body: { keys: mockSub.keys },
    }))

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).message).toContain('endpoint')
    expect(putItem).not.toHaveBeenCalled()
  })

  it('returns 400 when keys.p256dh is missing', async () => {
    const res = await handler(makeEvent({
      method: 'POST',
      path: '/push-subscriptions',
      body: { endpoint: mockSub.endpoint, keys: { auth: 'key-auth' } },
    }))

    expect(res.statusCode).toBe(400)
    expect(putItem).not.toHaveBeenCalled()
  })

  it('returns 400 when keys.auth is missing', async () => {
    const res = await handler(makeEvent({
      method: 'POST',
      path: '/push-subscriptions',
      body: { endpoint: mockSub.endpoint, keys: { p256dh: 'key-p256dh' } },
    }))

    expect(res.statusCode).toBe(400)
    expect(putItem).not.toHaveBeenCalled()
  })

  it('returns 400 when body is empty', async () => {
    const event = makeEvent({ method: 'POST', path: '/push-subscriptions' })
    event.body = ''
    const res = await handler(event)

    expect(res.statusCode).toBe(400)
  })
})

// ─── GET /push-subscriptions/me ───────────────────────────────────────────────

describe('GET /push-subscriptions/me', () => {
  it('returns 200 with endpoint when subscription exists', async () => {
    getItem.mockResolvedValueOnce({
      PK: `PUSH_SUB#${USER_ID}`,
      SK: 'PUSH_SUB',
      ...mockSub,
      userId: USER_ID,
      createdAt: new Date().toISOString(),
    })

    const res = await handler(makeEvent({
      method: 'GET',
      path: '/push-subscriptions/me',
    }))

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.endpoint).toBe(mockSub.endpoint)
    // Keys must NOT be returned
    expect(body.keys).toBeUndefined()
  })

  it('returns 404 when no subscription exists', async () => {
    getItem.mockResolvedValueOnce(null)

    const res = await handler(makeEvent({
      method: 'GET',
      path: '/push-subscriptions/me',
    }))

    expect(res.statusCode).toBe(404)
  })

  it('queries the correct DynamoDB key', async () => {
    getItem.mockResolvedValueOnce({ PK: `PUSH_SUB#${USER_ID}`, SK: 'PUSH_SUB', ...mockSub })

    await handler(makeEvent({ method: 'GET', path: '/push-subscriptions/me' }))

    expect(getItem).toHaveBeenCalledWith(`PUSH_SUB#${USER_ID}`, 'PUSH_SUB')
  })
})

// ─── DELETE /push-subscriptions/me ────────────────────────────────────────────

describe('DELETE /push-subscriptions/me', () => {
  it('returns 204 on successful deletion', async () => {
    const res = await handler(makeEvent({
      method: 'DELETE',
      path: '/push-subscriptions/me',
    }))

    expect(res.statusCode).toBe(204)
    expect(deleteItem).toHaveBeenCalledWith(`PUSH_SUB#${USER_ID}`, 'PUSH_SUB')
  })

  it('returns 204 even when no subscription existed (idempotent)', async () => {
    // deleteItem resolves regardless — DynamoDB DeleteItem is idempotent
    const res = await handler(makeEvent({
      method: 'DELETE',
      path: '/push-subscriptions/me',
    }))

    expect(res.statusCode).toBe(204)
  })
})

// ─── Unknown routes ───────────────────────────────────────────────────────────

describe('unknown routes', () => {
  it('returns 404 for unrecognised path', async () => {
    const res = await handler(makeEvent({
      method: 'GET',
      path: '/push-subscriptions/unknown',
    }))
    expect(res.statusCode).toBe(404)
  })

  it('returns 500 when an unexpected error is thrown', async () => {
    putItem.mockRejectedValueOnce(new Error('DynamoDB down'))
    const res = await handler(makeEvent({
      method: 'POST',
      path: '/push-subscriptions',
      body: mockSub,
    }))
    expect(res.statusCode).toBe(500)
  })
})
