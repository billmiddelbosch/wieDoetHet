import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import apiClient from '@/lib/axios'
import { useAdminStore } from '@/stores/admin'
import { useAdminUsers } from '../useAdminUsers'

vi.mock('@/lib/axios', () => ({
  default: { get: vi.fn(), patch: vi.fn() },
}))

const subscribedUser = {
  id: 'user-9',
  name: 'Anna',
  email: 'anna@example.nl',
  mailOptOut: false,
  mailOptOutAt: null,
  groups: [],
}

describe('useAdminUsers — setMailOptOut', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiClient.get.mockReset()
    apiClient.patch.mockReset()
  })

  it('PATCHes { optOut } and writes the server state into the current user', async () => {
    useAdminStore().setCurrentUser({ ...subscribedUser })
    apiClient.patch.mockResolvedValue({
      data: { id: 'user-9', mailOptOut: true, mailOptOutAt: '2026-03-04T10:00:00Z' },
    })
    const { setMailOptOut, currentUser } = useAdminUsers()

    const ok = await setMailOptOut('user-9', true)

    expect(apiClient.patch).toHaveBeenCalledWith('/admin/users/user-9/mail-opt-out', {
      optOut: true,
    })
    expect(ok).toBe(true)
    expect(currentUser.value.mailOptOut).toBe(true)
    expect(currentUser.value.mailOptOutAt).toBe('2026-03-04T10:00:00Z')
    // The rest of the detail (name, groups) is preserved.
    expect(currentUser.value.name).toBe('Anna')
  })

  it('clears the opt-out date when re-subscribing', async () => {
    useAdminStore().setCurrentUser({
      ...subscribedUser,
      mailOptOut: true,
      mailOptOutAt: '2026-03-04T10:00:00Z',
    })
    apiClient.patch.mockResolvedValue({
      data: { id: 'user-9', mailOptOut: false, mailOptOutAt: null },
    })
    const { setMailOptOut, currentUser } = useAdminUsers()

    await setMailOptOut('user-9', false)

    expect(currentUser.value.mailOptOut).toBe(false)
    expect(currentUser.value.mailOptOutAt).toBeNull()
  })

  it('leaves the current user untouched and resolves to false when the request fails', async () => {
    useAdminStore().setCurrentUser({ ...subscribedUser })
    apiClient.patch.mockRejectedValue({ response: { data: { message: 'boom' } } })
    const { setMailOptOut, currentUser, error } = useAdminUsers()

    const ok = await setMailOptOut('user-9', true)

    expect(ok).toBe(false)
    expect(currentUser.value.mailOptOut).toBe(false)
    // `error` drives the "user not found" state of the detail page.
    expect(error.value).toBeNull()
  })

  it('does not overwrite a different user that is currently loaded', async () => {
    useAdminStore().setCurrentUser({ ...subscribedUser, id: 'user-1' })
    apiClient.patch.mockResolvedValue({
      data: { id: 'user-9', mailOptOut: true, mailOptOutAt: 'x' },
    })
    const { setMailOptOut, currentUser } = useAdminUsers()

    await setMailOptOut('user-9', true)

    expect(currentUser.value.id).toBe('user-1')
    expect(currentUser.value.mailOptOut).toBe(false)
  })
})
