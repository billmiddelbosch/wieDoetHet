import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('starts unauthenticated', () => {
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.token).toBeNull()
  })

  it('setToken persists to localStorage and updates isAuthenticated', () => {
    const store = useAuthStore()
    store.setToken('abc123')
    expect(store.token).toBe('abc123')
    expect(store.isAuthenticated).toBe(true)
    expect(localStorage.getItem('auth_token')).toBe('abc123')
  })

  it('setUser stores user object', () => {
    const store = useAuthStore()
    store.setUser({ id: '1', name: 'Jan', email: 'jan@example.nl' })
    expect(store.user?.name).toBe('Jan')
  })

  it('logout clears token and user', () => {
    const store = useAuthStore()
    store.setToken('abc123')
    store.setUser({ id: '1', name: 'Jan', email: 'jan@example.nl' })
    store.logout()
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(localStorage.getItem('auth_token')).toBeNull()
  })

  it('setAnonymousUser stores name and generates sessionId', () => {
    const store = useAuthStore()
    store.setAnonymousUser('Marie')
    expect(store.anonymousUser?.name).toBe('Marie')
    expect(store.anonymousUser?.sessionId).toBeTruthy()
    const raw = localStorage.getItem('wdh_anonymous')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw)
    expect(parsed.name).toBe('Marie')
  })

  it('setAnonymousUser reuses existing sessionId', () => {
    const store = useAuthStore()
    store.setAnonymousUser('Marie')
    const firstId = store.anonymousUser?.sessionId
    store.setAnonymousUser('Jan')
    expect(store.anonymousUser?.sessionId).toBe(firstId)
    expect(store.anonymousUser?.name).toBe('Jan')
  })

  it('clearAnonymousUser removes from state and localStorage', () => {
    const store = useAuthStore()
    store.setAnonymousUser('Marie')
    store.clearAnonymousUser()
    expect(store.anonymousUser).toBeNull()
    expect(localStorage.getItem('wdh_anonymous')).toBeNull()
  })
})
