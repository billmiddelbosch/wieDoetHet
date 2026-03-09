import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock the Axios instance ───────────────────────────────────────────────────

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import apiClient from '@/lib/axios'
import { usePushSubscription } from '@/composables/usePushSubscription'

// ─── SW / Push API mock helpers ───────────────────────────────────────────────

/**
 * Build a minimal serviceWorker mock.
 *
 * The composable's subscribe/isSubscribed/unsubscribe functions do NOT read
 * Notification.permission — that lives in the ReminderSection computed.
 * So there is no need to stub Notification here.
 */
function makeSwMocks({ hasSubscription = false } = {}) {
  const subscriptionMock = hasSubscription
    ? {
        unsubscribe: vi.fn().mockResolvedValue(true),
        toJSON: vi.fn().mockReturnValue({
          endpoint: 'https://push.example.com/sub-123',
          keys: { p256dh: 'key-p256dh', auth: 'key-auth' },
        }),
      }
    : null

  const pushManagerMock = {
    subscribe: vi.fn().mockResolvedValue({
      toJSON: vi.fn().mockReturnValue({
        endpoint: 'https://push.example.com/sub-123',
        keys: { p256dh: 'key-p256dh', auth: 'key-auth' },
      }),
    }),
    getSubscription: vi.fn().mockResolvedValue(subscriptionMock),
  }

  const registrationMock = {
    pushManager: pushManagerMock,
  }

  const swMock = {
    register: vi.fn().mockResolvedValue(registrationMock),
    ready: Promise.resolve(registrationMock),
    getRegistration: vi.fn().mockResolvedValue(registrationMock),
  }

  return { swMock, registrationMock, subscriptionMock, pushManagerMock }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('usePushSubscription', () => {

  // ─── subscribe ────────────────────────────────────────────────────────────

  describe('subscribe', () => {
    it('returns false when serviceWorker is not available', async () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        get: () => undefined,
      })

      const { subscribe } = usePushSubscription()
      const result = await subscribe()

      expect(result).toBe(false)
      expect(apiClient.post).not.toHaveBeenCalled()
    })

    it('registers the service worker at /sw.js', async () => {
      const { swMock } = makeSwMocks()
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: swMock,
      })
      apiClient.post.mockResolvedValueOnce({})

      const { subscribe } = usePushSubscription()
      await subscribe()

      expect(swMock.register).toHaveBeenCalledWith('/sw.js')
    })

    it('POSTs endpoint and keys to /push-subscriptions', async () => {
      const { swMock } = makeSwMocks()
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: swMock,
      })
      apiClient.post.mockResolvedValueOnce({})

      const { subscribe } = usePushSubscription()
      const result = await subscribe()

      expect(apiClient.post).toHaveBeenCalledWith('/push-subscriptions', {
        endpoint: 'https://push.example.com/sub-123',
        keys: { p256dh: 'key-p256dh', auth: 'key-auth' },
      })
      expect(result).toBe(true)
    })

    it('throws when pushManager.subscribe rejects (permission denied)', async () => {
      const { swMock, pushManagerMock } = makeSwMocks()
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: swMock,
      })
      pushManagerMock.subscribe.mockRejectedValueOnce(new Error('Permission denied'))

      const { subscribe } = usePushSubscription()

      await expect(subscribe()).rejects.toThrow('Permission denied')
      expect(apiClient.post).not.toHaveBeenCalled()
    })

    it('returns false and does not POST when SW register resolves to null', async () => {
      const swMock = {
        register: vi.fn().mockResolvedValue(null),
        ready: Promise.resolve(null),
        getRegistration: vi.fn().mockResolvedValue(null),
      }
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: swMock,
      })

      const { subscribe } = usePushSubscription()

      // When getRegistration returns null the composable returns false (no push support)
      const result = await subscribe()
      expect(result).toBe(false)
      expect(apiClient.post).not.toHaveBeenCalled()
    })
  })

  // ─── isSubscribed ─────────────────────────────────────────────────────────

  describe('isSubscribed', () => {
    it('returns false when serviceWorker is not available', async () => {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        get: () => undefined,
      })

      const { isSubscribed } = usePushSubscription()
      const result = await isSubscribed()

      expect(result).toBe(false)
    })

    it('returns false when no SW registration found', async () => {
      const swMock = { getRegistration: vi.fn().mockResolvedValue(undefined) }
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: swMock,
      })

      const { isSubscribed } = usePushSubscription()
      const result = await isSubscribed()

      expect(result).toBe(false)
      expect(apiClient.get).not.toHaveBeenCalled()
    })

    it('returns false when no local push subscription exists', async () => {
      const { swMock, pushManagerMock } = makeSwMocks({ hasSubscription: false })
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: swMock,
      })

      const { isSubscribed } = usePushSubscription()
      const result = await isSubscribed()

      expect(pushManagerMock.getSubscription).toHaveBeenCalled()
      expect(result).toBe(false)
      expect(apiClient.get).not.toHaveBeenCalled()
    })

    it('returns true when local subscription exists and backend confirms it', async () => {
      const { swMock } = makeSwMocks({ hasSubscription: true })
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: swMock,
      })
      apiClient.get.mockResolvedValueOnce({ data: { endpoint: 'https://push.example.com/sub-123' } })

      const { isSubscribed } = usePushSubscription()
      const result = await isSubscribed()

      expect(apiClient.get).toHaveBeenCalledWith('/push-subscriptions/me')
      expect(result).toBe(true)
    })

    it('returns false when local subscription exists but backend returns 404', async () => {
      const { swMock } = makeSwMocks({ hasSubscription: true })
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: swMock,
      })
      apiClient.get.mockRejectedValueOnce({ response: { status: 404 } })

      const { isSubscribed } = usePushSubscription()
      const result = await isSubscribed()

      expect(result).toBe(false)
    })
  })

  // ─── unsubscribe ──────────────────────────────────────────────────────────

  describe('unsubscribe', () => {
    it('calls browser unsubscribe and DELETEs from backend', async () => {
      const { swMock, subscriptionMock } = makeSwMocks({ hasSubscription: true })
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: swMock,
      })
      apiClient.delete.mockResolvedValueOnce({})

      const { unsubscribe } = usePushSubscription()
      await unsubscribe()

      expect(subscriptionMock.unsubscribe).toHaveBeenCalled()
      expect(apiClient.delete).toHaveBeenCalledWith('/push-subscriptions/me')
    })

    it('still completes when backend DELETE fails (silent catch)', async () => {
      const { swMock, subscriptionMock } = makeSwMocks({ hasSubscription: true })
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: swMock,
      })
      apiClient.delete.mockRejectedValueOnce(new Error('Network error'))

      const { unsubscribe } = usePushSubscription()

      // Should not throw — backend error is swallowed by .catch(() => {})
      await expect(unsubscribe()).resolves.toBeUndefined()
      expect(subscriptionMock.unsubscribe).toHaveBeenCalled()
    })

    it('completes gracefully when no registration exists', async () => {
      const swMock = { getRegistration: vi.fn().mockResolvedValue(undefined) }
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: swMock,
      })
      apiClient.delete.mockResolvedValueOnce({})

      const { unsubscribe } = usePushSubscription()
      await expect(unsubscribe()).resolves.toBeUndefined()
    })
  })
})
