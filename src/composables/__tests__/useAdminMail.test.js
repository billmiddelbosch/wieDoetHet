import { describe, it, expect, vi, beforeEach } from 'vitest'
import apiClient from '@/lib/axios'
import { useAdminMail } from '../useAdminMail'

vi.mock('@/lib/axios', () => ({
  default: { post: vi.fn() },
}))

describe('useAdminMail', () => {
  beforeEach(() => {
    apiClient.post.mockReset()
  })

  it('sends an explicit userIds payload when not selecting all', async () => {
    apiClient.post.mockResolvedValue({ data: { sent: 2, failed: 0, failures: [] } })
    const { sendMail } = useAdminMail()

    const result = await sendMail({
      userIds: ['u1', 'u2'],
      subject: 'Hi',
      html: '<p>Hello</p>',
    })

    expect(apiClient.post).toHaveBeenCalledWith('/admin/mail', {
      userIds: ['u1', 'u2'],
      subject: 'Hi',
      html: '<p>Hello</p>',
    })
    expect(result).toEqual({ sent: 2, failed: 0, failures: [] })
  })

  it('sends a { selectAll, q } payload — never a client-built id list — when selecting all matching', async () => {
    apiClient.post.mockResolvedValue({ data: { sent: 50, failed: 1, failures: [] } })
    const { sendMail } = useAdminMail()

    await sendMail({
      selectAll: true,
      q: 'amsterdam',
      subject: 'Hi all',
      html: '<p>Hello</p>',
      userIds: ['should-be-ignored'],
    })

    expect(apiClient.post).toHaveBeenCalledWith('/admin/mail', {
      selectAll: true,
      q: 'amsterdam',
      subject: 'Hi all',
      html: '<p>Hello</p>',
    })
  })

  it('tracks loading state during the request', async () => {
    let resolveRequest
    apiClient.post.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      })
    )
    const { sendMail, loading } = useAdminMail()

    expect(loading.value).toBe(false)
    const promise = sendMail({ userIds: ['u1'], subject: 'S', html: '<p>H</p>' })
    expect(loading.value).toBe(true)

    resolveRequest({ data: { sent: 1, failed: 0, failures: [] } })
    await promise
    expect(loading.value).toBe(false)
  })

  it('sets error and returns null on request failure', async () => {
    apiClient.post.mockRejectedValue({ response: { data: { message: 'Boom' } } })
    const { sendMail, error } = useAdminMail()

    const result = await sendMail({ userIds: ['u1'], subject: 'S', html: '<p>H</p>' })

    expect(result).toBeNull()
    expect(error.value).toBe('Boom')
  })

  it('falls back to err.message when no response payload is present', async () => {
    apiClient.post.mockRejectedValue(new Error('Network error'))
    const { sendMail, error } = useAdminMail()

    const result = await sendMail({ userIds: ['u1'], subject: 'S', html: '<p>H</p>' })

    expect(result).toBeNull()
    expect(error.value).toBe('Network error')
  })
})
