import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useReminder } from '@/composables/useReminder'

// Mock the configured Axios instance
vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import apiClient from '@/lib/axios'

const FUTURE_ISO = new Date(Date.now() + 86_400_000).toISOString() // tomorrow

const mockReminder = {
  scope: 'group',
  scopeId: 'group-1',
  groupId: 'group-1',
  initiatorId: 'user-1',
  scheduledAt: FUTURE_ISO,
  ruleName: 'wdh-reminder-group-group-1',
  status: 'scheduled',
}

describe('useReminder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── fetchReminder ────────────────────────────────────────────────────────

  describe('fetchReminder', () => {
    it('returns reminder data on success', async () => {
      apiClient.get.mockResolvedValueOnce({ data: mockReminder })
      const { fetchReminder, loading, error } = useReminder()

      const result = await fetchReminder('group', 'group-1')

      expect(apiClient.get).toHaveBeenCalledWith('/reminders/group/group-1')
      expect(result).toEqual(mockReminder)
      expect(loading.value).toBe(false)
      expect(error.value).toBeNull()
    })

    it('returns { scheduledAt: null, status: "none" } when no reminder exists', async () => {
      apiClient.get.mockResolvedValueOnce({ data: { scope: 'group', id: 'group-1', scheduledAt: null, status: 'none' } })
      const { fetchReminder } = useReminder()

      const result = await fetchReminder('group', 'group-1')

      expect(result.status).toBe('none')
      expect(result.scheduledAt).toBeNull()
    })

    it('sets error and returns null on API failure', async () => {
      apiClient.get.mockRejectedValueOnce({
        response: { data: { message: 'Niet gevonden' } },
      })
      const { fetchReminder, error } = useReminder()

      const result = await fetchReminder('group', 'group-1')

      expect(result).toBeNull()
      expect(error.value).toBe('Niet gevonden')
    })

    it('resets loading to false after failure', async () => {
      apiClient.get.mockRejectedValueOnce(new Error('Network error'))
      const { fetchReminder, loading } = useReminder()

      await fetchReminder('group', 'group-1')

      expect(loading.value).toBe(false)
    })

    it('sets loading to true during the request', async () => {
      let resolveFn
      apiClient.get.mockReturnValueOnce(new Promise((r) => { resolveFn = r }))
      const { fetchReminder, loading } = useReminder()

      const promise = fetchReminder('group', 'group-1')
      expect(loading.value).toBe(true)

      resolveFn({ data: mockReminder })
      await promise
      expect(loading.value).toBe(false)
    })
  })

  // ─── scheduleReminder ─────────────────────────────────────────────────────

  describe('scheduleReminder', () => {
    it('POSTs with correct payload for group scope', async () => {
      apiClient.post.mockResolvedValueOnce({ data: mockReminder })
      const { scheduleReminder } = useReminder()

      const result = await scheduleReminder('group', 'group-1', FUTURE_ISO)

      expect(apiClient.post).toHaveBeenCalledWith('/reminders', {
        scope: 'group',
        id: 'group-1',
        scheduledAt: FUTURE_ISO,
      })
      expect(result).toEqual(mockReminder)
    })

    it('includes groupId in payload for task scope', async () => {
      const taskReminder = { ...mockReminder, scope: 'task', scopeId: 'task-1' }
      apiClient.post.mockResolvedValueOnce({ data: taskReminder })
      const { scheduleReminder } = useReminder()

      await scheduleReminder('task', 'task-1', FUTURE_ISO, 'group-1')

      expect(apiClient.post).toHaveBeenCalledWith('/reminders', {
        scope: 'task',
        id: 'task-1',
        scheduledAt: FUTURE_ISO,
        groupId: 'group-1',
      })
    })

    it('does NOT include groupId for group scope', async () => {
      apiClient.post.mockResolvedValueOnce({ data: mockReminder })
      const { scheduleReminder } = useReminder()

      await scheduleReminder('group', 'group-1', FUTURE_ISO)

      const payload = apiClient.post.mock.calls[0][1]
      expect(payload).not.toHaveProperty('groupId')
    })

    it('returns null and sets error on API failure', async () => {
      apiClient.post.mockRejectedValueOnce({
        response: { data: { message: 'scheduledAt moet in de toekomst liggen' } },
      })
      const { scheduleReminder, error } = useReminder()

      const result = await scheduleReminder('group', 'group-1', FUTURE_ISO)

      expect(result).toBeNull()
      expect(error.value).toBe('scheduledAt moet in de toekomst liggen')
    })

    it('resets loading to false after success', async () => {
      apiClient.post.mockResolvedValueOnce({ data: mockReminder })
      const { scheduleReminder, loading } = useReminder()

      await scheduleReminder('group', 'group-1', FUTURE_ISO)

      expect(loading.value).toBe(false)
    })

    it('clears previous error before new request', async () => {
      apiClient.post.mockRejectedValueOnce(new Error('First error'))
      const { scheduleReminder, error } = useReminder()
      await scheduleReminder('group', 'group-1', FUTURE_ISO)
      expect(error.value).toBeTruthy()

      apiClient.post.mockResolvedValueOnce({ data: mockReminder })
      await scheduleReminder('group', 'group-1', FUTURE_ISO)
      expect(error.value).toBeNull()
    })
  })

  // ─── cancelReminder ───────────────────────────────────────────────────────

  describe('cancelReminder', () => {
    it('sends DELETE to correct URL', async () => {
      apiClient.delete.mockResolvedValueOnce({})
      const { cancelReminder } = useReminder()

      const result = await cancelReminder('group', 'group-1')

      expect(apiClient.delete).toHaveBeenCalledWith('/reminders/group/group-1')
      expect(result).toBe(true)
    })

    it('sends DELETE for task scope', async () => {
      apiClient.delete.mockResolvedValueOnce({})
      const { cancelReminder } = useReminder()

      await cancelReminder('task', 'task-42')

      expect(apiClient.delete).toHaveBeenCalledWith('/reminders/task/task-42')
    })

    it('returns false and sets error on API failure', async () => {
      apiClient.delete.mockRejectedValueOnce({
        response: { data: { message: 'Herinnering niet gevonden' } },
      })
      const { cancelReminder, error } = useReminder()

      const result = await cancelReminder('group', 'group-1')

      expect(result).toBe(false)
      expect(error.value).toBe('Herinnering niet gevonden')
    })

    it('resets loading to false after success', async () => {
      apiClient.delete.mockResolvedValueOnce({})
      const { cancelReminder, loading } = useReminder()

      await cancelReminder('group', 'group-1')

      expect(loading.value).toBe(false)
    })

    it('resets loading to false after failure', async () => {
      apiClient.delete.mockRejectedValueOnce(new Error('Network error'))
      const { cancelReminder, loading } = useReminder()

      await cancelReminder('group', 'group-1')

      expect(loading.value).toBe(false)
    })
  })

  // ─── Independent state per call ───────────────────────────────────────────

  it('each useReminder() call has independent state', async () => {
    apiClient.get.mockRejectedValueOnce(new Error('err-1'))
    apiClient.get.mockResolvedValueOnce({ data: mockReminder })

    const composable1 = useReminder()
    const composable2 = useReminder()

    await composable1.fetchReminder('group', 'g1')
    await composable2.fetchReminder('group', 'g2')

    expect(composable1.error.value).toBeTruthy()
    expect(composable2.error.value).toBeNull()
  })
})
