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

vi.mock('../../shared/sns.js', () => ({
  sendWebPush: vi.fn(),
  sendSms: vi.fn(),
}))

import { handler } from '../index.js'
import { getItem, queryByPk, queryGsi1, updateItem } from '../../shared/db.js'
import { deleteRule } from '../../shared/eventbridge.js'
import { sendWebPush, sendSms } from '../../shared/sns.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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

const mockInitiatorWithPhone = {
  id: USER_ID,
  name: 'Jan de Vries',
  phoneNumber: '+31612345678',
}

const mockInitiatorNoPhone = {
  id: USER_ID,
  name: 'Jan de Vries',
  phoneNumber: null,
}

const mockPushSub = {
  PK: `PUSH_SUB#${USER_ID}`,
  SK: 'PUSH_SUB',
  endpoint: 'https://push.example.com/sub-123',
  keys: { p256dh: 'key-p256dh', auth: 'key-auth' },
  userId: USER_ID,
}

const mockTaskWithCap = {
  id: TASK_ID,
  groupId: GROUP_ID,
  title: 'Boodschappen',
  maxClaims: 2,
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TABLE_NAME = 'wdh-test'
  process.env.VAPID_PUBLIC_KEY = 'test-vapid-public'
  process.env.VAPID_PRIVATE_KEY = 'test-vapid-private'
  process.env.VAPID_SUBJECT = 'mailto:test@example.com'
  deleteRule.mockResolvedValue()
  updateItem.mockResolvedValue()
  sendWebPush.mockResolvedValue()
  sendSms.mockResolvedValue()
})

// ─── Handler guard rails ──────────────────────────────────────────────────────

describe('handler guard rails', () => {
  it('exits cleanly when ruleName is missing from event', async () => {
    await handler({})
    expect(queryGsi1).not.toHaveBeenCalled()
    expect(deleteRule).not.toHaveBeenCalled()
  })

  it('exits cleanly when reminder record is not found (already cancelled)', async () => {
    queryGsi1.mockResolvedValueOnce([])
    await handler({ ruleName: RULE_NAME })
    expect(updateItem).not.toHaveBeenCalled()
    expect(deleteRule).not.toHaveBeenCalled()
  })

  it('exits and cleans rule when reminder status is not "scheduled"', async () => {
    queryGsi1.mockResolvedValueOnce([{ ...mockReminder, status: 'sent' }])
    await handler({ ruleName: RULE_NAME })
    expect(deleteRule).toHaveBeenCalledWith(RULE_NAME)
    expect(sendWebPush).not.toHaveBeenCalled()
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('marks reminder as failed and cleans rule when group is not found', async () => {
    queryGsi1.mockResolvedValueOnce([mockReminder])
    getItem.mockResolvedValueOnce(null) // group not found
    await handler({ ruleName: RULE_NAME })
    expect(updateItem).toHaveBeenCalledWith(
      `REMINDER#group#${GROUP_ID}`, 'REMINDER', { status: 'failed' }
    )
    expect(deleteRule).toHaveBeenCalledWith(RULE_NAME)
    expect(sendWebPush).not.toHaveBeenCalled()
  })
})

// ─── Group scope — all tasks full ─────────────────────────────────────────────

describe('group scope — all tasks full', () => {
  it('marks as sent and cleans rule without sending any notification', async () => {
    queryGsi1.mockResolvedValueOnce([mockReminder])
    getItem.mockResolvedValueOnce(mockGroup)
    queryByPk
      .mockResolvedValueOnce([mockTaskWithCap])           // tasks in group
      .mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }]) // 2 claims — full

    await handler({ ruleName: RULE_NAME })

    expect(sendWebPush).not.toHaveBeenCalled()
    expect(sendSms).not.toHaveBeenCalled()
    expect(updateItem).toHaveBeenCalledWith(
      `REMINDER#group#${GROUP_ID}`, 'REMINDER', { status: 'sent' }
    )
    expect(deleteRule).toHaveBeenCalledWith(RULE_NAME)
  })
})

// ─── Group scope — unmet minimums, Web Push paths ────────────────────────────

describe('group scope — push success path', () => {
  it('sends Web Push and marks as sent when push subscription exists', async () => {
    queryGsi1.mockResolvedValueOnce([mockReminder])
    getItem
      .mockResolvedValueOnce(mockGroup)   // group load
      .mockResolvedValueOnce(mockPushSub) // push subscription found
    queryByPk
      .mockResolvedValueOnce([mockTaskWithCap]) // tasks
      .mockResolvedValueOnce([])               // 0 claims — unmet

    await handler({ ruleName: RULE_NAME })

    expect(sendWebPush).toHaveBeenCalledOnce()
    expect(sendWebPush).toHaveBeenCalledWith(
      { endpoint: mockPushSub.endpoint, keys: mockPushSub.keys },
      expect.objectContaining({
        title: 'wieDoetHet',
        body: expect.stringContaining('Test groep'),
        url: expect.stringContaining('tok-abc123'),
        tag: `wdh-reminder-group-${GROUP_ID}`,
      })
    )
    expect(sendSms).not.toHaveBeenCalled()
    expect(updateItem).toHaveBeenCalledWith(
      `REMINDER#group#${GROUP_ID}`, 'REMINDER', { status: 'sent' }
    )
    expect(deleteRule).toHaveBeenCalledWith(RULE_NAME)
  })

  it('push payload url contains the group shareToken', async () => {
    queryGsi1.mockResolvedValueOnce([mockReminder])
    getItem
      .mockResolvedValueOnce(mockGroup)
      .mockResolvedValueOnce(mockPushSub)
    queryByPk
      .mockResolvedValueOnce([mockTaskWithCap])
      .mockResolvedValueOnce([])

    await handler({ ruleName: RULE_NAME })

    const payload = sendWebPush.mock.calls[0][1]
    expect(payload.url).toContain('tok-abc123')
  })
})

// ─── Group scope — push fail → SMS fallback ───────────────────────────────────

describe('group scope — push fails, SMS fallback', () => {
  it('falls back to SMS when sendWebPush throws and initiator has phone', async () => {
    const pushError = Object.assign(new Error('push failed'), { statusCode: 410 })
    sendWebPush.mockRejectedValueOnce(pushError)

    queryGsi1.mockResolvedValueOnce([mockReminder])
    getItem
      .mockResolvedValueOnce(mockGroup)          // group load
      .mockResolvedValueOnce(mockPushSub)        // push subscription found
      .mockResolvedValueOnce(mockInitiatorWithPhone) // initiator for SMS fallback
    queryByPk
      .mockResolvedValueOnce([mockTaskWithCap])
      .mockResolvedValueOnce([])

    await handler({ ruleName: RULE_NAME })

    expect(sendWebPush).toHaveBeenCalledOnce()
    expect(sendSms).toHaveBeenCalledOnce()
    expect(sendSms).toHaveBeenCalledWith(
      '+31612345678',
      expect.stringContaining('Test groep')
    )
    expect(updateItem).toHaveBeenCalledWith(
      `REMINDER#group#${GROUP_ID}`, 'REMINDER', { status: 'sent' }
    )
    expect(deleteRule).toHaveBeenCalledWith(RULE_NAME)
  })

  it('SMS message contains the shareUrl', async () => {
    sendWebPush.mockRejectedValueOnce(new Error('push gone'))

    queryGsi1.mockResolvedValueOnce([mockReminder])
    getItem
      .mockResolvedValueOnce(mockGroup)
      .mockResolvedValueOnce(mockPushSub)
      .mockResolvedValueOnce(mockInitiatorWithPhone)
    queryByPk
      .mockResolvedValueOnce([mockTaskWithCap])
      .mockResolvedValueOnce([])

    await handler({ ruleName: RULE_NAME })

    const smsMessage = sendSms.mock.calls[0][1]
    expect(smsMessage).toContain('tok-abc123')
  })

  it('marks as failed when push fails and initiator has no phone', async () => {
    sendWebPush.mockRejectedValueOnce(new Error('push gone'))

    queryGsi1.mockResolvedValueOnce([mockReminder])
    getItem
      .mockResolvedValueOnce(mockGroup)
      .mockResolvedValueOnce(mockPushSub)        // push sub found (but fails)
      .mockResolvedValueOnce(mockInitiatorNoPhone) // no phone for SMS fallback
    queryByPk
      .mockResolvedValueOnce([mockTaskWithCap])
      .mockResolvedValueOnce([])

    await handler({ ruleName: RULE_NAME })

    expect(sendWebPush).toHaveBeenCalledOnce()
    expect(sendSms).not.toHaveBeenCalled()
    expect(updateItem).toHaveBeenCalledWith(
      `REMINDER#group#${GROUP_ID}`, 'REMINDER', { status: 'failed' }
    )
    expect(deleteRule).toHaveBeenCalledWith(RULE_NAME)
  })
})

// ─── Group scope — no push subscription ───────────────────────────────────────

describe('group scope — no push subscription', () => {
  it('sends SMS directly when no push sub and initiator has phone', async () => {
    queryGsi1.mockResolvedValueOnce([mockReminder])
    getItem
      .mockResolvedValueOnce(mockGroup)          // group load
      .mockResolvedValueOnce(null)               // no push subscription
      .mockResolvedValueOnce(mockInitiatorWithPhone) // initiator for SMS
    queryByPk
      .mockResolvedValueOnce([mockTaskWithCap])
      .mockResolvedValueOnce([])

    await handler({ ruleName: RULE_NAME })

    expect(sendWebPush).not.toHaveBeenCalled()
    expect(sendSms).toHaveBeenCalledOnce()
    expect(sendSms).toHaveBeenCalledWith(
      '+31612345678',
      expect.stringContaining('Test groep')
    )
    expect(updateItem).toHaveBeenCalledWith(
      `REMINDER#group#${GROUP_ID}`, 'REMINDER', { status: 'sent' }
    )
  })

  it('marks as failed when no push sub and initiator has no phone', async () => {
    queryGsi1.mockResolvedValueOnce([mockReminder])
    getItem
      .mockResolvedValueOnce(mockGroup)
      .mockResolvedValueOnce(null)               // no push subscription
      .mockResolvedValueOnce(mockInitiatorNoPhone) // no phone either
    queryByPk
      .mockResolvedValueOnce([mockTaskWithCap])
      .mockResolvedValueOnce([])

    await handler({ ruleName: RULE_NAME })

    expect(sendWebPush).not.toHaveBeenCalled()
    expect(sendSms).not.toHaveBeenCalled()
    expect(updateItem).toHaveBeenCalledWith(
      `REMINDER#group#${GROUP_ID}`, 'REMINDER', { status: 'failed' }
    )
    expect(deleteRule).toHaveBeenCalledWith(RULE_NAME)
  })
})

// ─── Task scope ───────────────────────────────────────────────────────────────

describe('task scope', () => {
  const taskRuleName = `wdh-reminder-task-${TASK_ID}`
  const taskReminder = {
    ...mockReminder,
    PK: `REMINDER#task#${TASK_ID}`,
    scope: 'task',
    scopeId: TASK_ID,
    ruleName: taskRuleName,
  }

  it('sends push with task-specific body when task is unmet', async () => {
    queryGsi1.mockResolvedValueOnce([taskReminder])
    getItem
      .mockResolvedValueOnce(mockGroup)
      .mockResolvedValueOnce(mockPushSub)
    queryByPk
      .mockResolvedValueOnce([mockTaskWithCap]) // tasks (for taskHasUnmetMinimum)
      .mockResolvedValueOnce([])               // 0 claims — unmet

    await handler({ ruleName: taskRuleName })

    expect(sendWebPush).toHaveBeenCalledOnce()
    const payload = sendWebPush.mock.calls[0][1]
    // Task scope body differs from group scope body
    expect(payload.body).toContain('Test groep')
    expect(payload.tag).toBe(`wdh-reminder-task-${TASK_ID}`)
    expect(updateItem).toHaveBeenCalledWith(
      `REMINDER#task#${TASK_ID}`, 'REMINDER', { status: 'sent' }
    )
  })

  it('does not send when task is already full', async () => {
    queryGsi1.mockResolvedValueOnce([taskReminder])
    getItem.mockResolvedValueOnce(mockGroup)
    queryByPk
      .mockResolvedValueOnce([mockTaskWithCap])
      .mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }]) // fully claimed

    await handler({ ruleName: taskRuleName })

    expect(sendWebPush).not.toHaveBeenCalled()
    expect(sendSms).not.toHaveBeenCalled()
    expect(updateItem).toHaveBeenCalledWith(
      `REMINDER#task#${TASK_ID}`, 'REMINDER', { status: 'sent' }
    )
  })
})

// ─── finally block — rule always deleted ─────────────────────────────────────

describe('finally block', () => {
  it('always calls deleteRule even when an unexpected error is thrown', async () => {
    queryGsi1.mockResolvedValueOnce([mockReminder])
    getItem.mockRejectedValueOnce(new Error('DynamoDB down'))

    await handler({ ruleName: RULE_NAME })

    expect(deleteRule).toHaveBeenCalledWith(RULE_NAME)
    expect(updateItem).toHaveBeenCalledWith(
      `REMINDER#group#${GROUP_ID}`, 'REMINDER', { status: 'failed' }
    )
  })
})
