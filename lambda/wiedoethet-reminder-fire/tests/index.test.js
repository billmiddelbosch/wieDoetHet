import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock shared modules ───────────────────────────────────────────────────────

vi.mock('../../shared/db.js', () => ({
  getItem: vi.fn(),
  queryByPk: vi.fn(),
  queryGsi1: vi.fn(),
  updateItem: vi.fn(),
}))

vi.mock('../../shared/eventbridge.js', () => ({
  deleteRule: vi.fn(),
}))

// Mock global fetch for WhatsApp API calls
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { handler } from '../index.js'
import { getItem, queryByPk, queryGsi1, updateItem } from '../../shared/db.js'
import { deleteRule } from '../../shared/eventbridge.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RULE_NAME = 'wdh-reminder-group-group-123'
const GROUP_ID = 'group-123'
const TASK_ID = 'task-456'
const USER_ID = 'user-abc'

const mockReminder = {
  PK: `REMINDER#group#${GROUP_ID}`,
  SK: 'REMINDER',
  GSI1PK: `RULE#${RULE_NAME}`,
  GSI1SK: 'REMINDER',
  scope: 'group',
  scopeId: GROUP_ID,
  groupId: GROUP_ID,
  initiatorId: USER_ID,
  scheduledAt: new Date(Date.now() - 1000).toISOString(),
  ruleName: RULE_NAME,
  status: 'scheduled',
}

const mockGroup = {
  id: GROUP_ID,
  name: 'Test groep',
  shareToken: 'tok-abc123',
  initiatorId: USER_ID,
}

const mockInitiator = {
  id: USER_ID,
  name: 'Jan de Vries',
  phoneNumber: '+31612345678',
}

const mockTaskWithCap = {
  id: TASK_ID,
  groupId: GROUP_ID,
  title: 'Boodschappen',
  maxClaims: 2,
}

function whatsappOk() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ messages: [{ id: 'wamid.abc' }] }),
  })
}

function whatsappFail(status = 500) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ error: { message: 'API error' } }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TABLE_NAME = 'wdh-test'
  process.env.WHATSAPP_TOKEN = 'test-token'
  process.env.WHATSAPP_PHONE_ID = 'phone-id-123'
  deleteRule.mockResolvedValue()
  updateItem.mockResolvedValue()
})

// ─── Handler tests ────────────────────────────────────────────────────────────

describe('wiedoethet-reminder-fire handler', () => {

  it('exits cleanly when ruleName is missing from event', async () => {
    await handler({})
    expect(queryGsi1).not.toHaveBeenCalled()
    expect(deleteRule).not.toHaveBeenCalled()
  })

  it('exits cleanly when reminder record is not found (already cancelled)', async () => {
    queryGsi1.mockResolvedValueOnce([]) // no reminder found
    await handler({ ruleName: RULE_NAME })
    expect(updateItem).not.toHaveBeenCalled()
    expect(deleteRule).not.toHaveBeenCalled()
  })

  it('exits and cleans rule when reminder status is not "scheduled"', async () => {
    queryGsi1.mockResolvedValueOnce([{ ...mockReminder, status: 'sent' }])
    await handler({ ruleName: RULE_NAME })
    expect(deleteRule).toHaveBeenCalledWith(RULE_NAME)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('marks reminder as failed and cleans rule when group is not found', async () => {
    queryGsi1.mockResolvedValueOnce([mockReminder])
    getItem.mockResolvedValueOnce(null) // group not found
    await handler({ ruleName: RULE_NAME })
    expect(updateItem).toHaveBeenCalledWith(
      `REMINDER#group#${GROUP_ID}`, 'REMINDER', { status: 'failed' }
    )
    expect(deleteRule).toHaveBeenCalledWith(RULE_NAME)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  describe('group scope — all tasks full', () => {
    it('marks as sent and cleans rule without sending WhatsApp when all minimums are met', async () => {
      queryGsi1.mockResolvedValueOnce([mockReminder])
      getItem
        .mockResolvedValueOnce(mockGroup)  // group load
      queryByPk
        .mockResolvedValueOnce([mockTaskWithCap])                    // tasks in group
        .mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }])         // 2 claims — full

      await handler({ ruleName: RULE_NAME })

      expect(mockFetch).not.toHaveBeenCalled()
      expect(updateItem).toHaveBeenCalledWith(
        `REMINDER#group#${GROUP_ID}`, 'REMINDER', { status: 'sent' }
      )
      expect(deleteRule).toHaveBeenCalledWith(RULE_NAME)
    })
  })

  describe('group scope — unmet minimums', () => {
    it('marks as failed and cleans rule when initiator has no phone number', async () => {
      queryGsi1.mockResolvedValueOnce([mockReminder])
      getItem
        .mockResolvedValueOnce(mockGroup)                          // group load
        .mockResolvedValueOnce({ ...mockInitiator, phoneNumber: null }) // no phone
      queryByPk
        .mockResolvedValueOnce([mockTaskWithCap])                  // tasks
        .mockResolvedValueOnce([])                                  // 0 claims — unmet

      await handler({ ruleName: RULE_NAME })

      expect(mockFetch).not.toHaveBeenCalled()
      expect(updateItem).toHaveBeenCalledWith(
        `REMINDER#group#${GROUP_ID}`, 'REMINDER', { status: 'failed' }
      )
      expect(deleteRule).toHaveBeenCalledWith(RULE_NAME)
    })

    it('sends WhatsApp and marks as sent when minimums are unmet and phone exists', async () => {
      queryGsi1.mockResolvedValueOnce([mockReminder])
      getItem
        .mockResolvedValueOnce(mockGroup)    // group load
        .mockResolvedValueOnce(mockInitiator) // initiator with phone
      queryByPk
        .mockResolvedValueOnce([mockTaskWithCap]) // tasks
        .mockResolvedValueOnce([])               // 0 claims — unmet
      whatsappOk()

      await handler({ ruleName: RULE_NAME })

      expect(mockFetch).toHaveBeenCalledOnce()
      const fetchCall = mockFetch.mock.calls[0]
      expect(fetchCall[0]).toContain('graph.facebook.com')
      const fetchBody = JSON.parse(fetchCall[1].body)
      expect(fetchBody.to).toBe('+31612345678')
      expect(fetchBody.text.body).toContain('Test groep')
      expect(fetchBody.text.body).toContain('tok-abc123')

      expect(updateItem).toHaveBeenCalledWith(
        `REMINDER#group#${GROUP_ID}`, 'REMINDER', { status: 'sent' }
      )
      expect(deleteRule).toHaveBeenCalledWith(RULE_NAME)
    })

    it('marks as failed and always cleans rule when WhatsApp API returns error', async () => {
      queryGsi1.mockResolvedValueOnce([mockReminder])
      getItem
        .mockResolvedValueOnce(mockGroup)
        .mockResolvedValueOnce(mockInitiator)
      queryByPk
        .mockResolvedValueOnce([mockTaskWithCap])
        .mockResolvedValueOnce([])
      whatsappFail()

      await handler({ ruleName: RULE_NAME })

      expect(updateItem).toHaveBeenCalledWith(
        `REMINDER#group#${GROUP_ID}`, 'REMINDER', { status: 'failed' }
      )
      expect(deleteRule).toHaveBeenCalledWith(RULE_NAME)
    })
  })

  describe('task scope', () => {
    const taskReminder = {
      ...mockReminder,
      PK: `REMINDER#task#${TASK_ID}`,
      scope: 'task',
      scopeId: TASK_ID,
      ruleName: `wdh-reminder-task-${TASK_ID}`,
    }

    it('sends WhatsApp when specific task is unmet', async () => {
      queryGsi1.mockResolvedValueOnce([taskReminder])
      getItem
        .mockResolvedValueOnce(mockGroup)
        .mockResolvedValueOnce(mockInitiator)
      queryByPk
        .mockResolvedValueOnce([mockTaskWithCap]) // tasks in group (for taskHasUnmetMinimum)
        .mockResolvedValueOnce([])               // 0 claims on that task
      whatsappOk()

      await handler({ ruleName: `wdh-reminder-task-${TASK_ID}` })

      expect(mockFetch).toHaveBeenCalledOnce()
      expect(updateItem).toHaveBeenCalledWith(
        `REMINDER#task#${TASK_ID}`, 'REMINDER', { status: 'sent' }
      )
    })

    it('does not send WhatsApp when task is already full', async () => {
      queryGsi1.mockResolvedValueOnce([taskReminder])
      getItem.mockResolvedValueOnce(mockGroup)
      queryByPk
        .mockResolvedValueOnce([mockTaskWithCap])     // tasks in group
        .mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }]) // fully claimed

      await handler({ ruleName: `wdh-reminder-task-${TASK_ID}` })

      expect(mockFetch).not.toHaveBeenCalled()
      expect(updateItem).toHaveBeenCalledWith(
        `REMINDER#task#${TASK_ID}`, 'REMINDER', { status: 'sent' }
      )
    })
  })

  it('always calls deleteRule in finally block, even when an error is thrown mid-handler', async () => {
    queryGsi1.mockResolvedValueOnce([mockReminder])
    getItem.mockRejectedValueOnce(new Error('DynamoDB down'))

    await handler({ ruleName: RULE_NAME })

    expect(deleteRule).toHaveBeenCalledWith(RULE_NAME)
    expect(updateItem).toHaveBeenCalledWith(
      `REMINDER#group#${GROUP_ID}`, 'REMINDER', { status: 'failed' }
    )
  })
})
