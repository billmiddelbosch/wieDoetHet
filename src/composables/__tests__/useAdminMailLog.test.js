import { describe, it, expect, vi, beforeEach } from 'vitest'
import apiClient from '@/lib/axios'
import { useAdminMailLog } from '../useAdminMailLog'

vi.mock('@/lib/axios', () => ({
  default: { get: vi.fn() },
}))

const row = (n) => ({
  id: `welcome:u${n}:-`,
  templateId: 'welcome',
  email: `u${n}@example.nl`,
  status: 'sent',
})

describe('useAdminMailLog', () => {
  beforeEach(() => {
    apiClient.get.mockReset()
  })

  it('loads the first page with only the page size as param', async () => {
    apiClient.get.mockResolvedValue({ data: { items: [row(1), row(2)], nextCursor: null } })
    const { fetchLog, items, hasNext, hasPrevious } = useAdminMailLog()

    await fetchLog()

    expect(apiClient.get).toHaveBeenCalledWith('/admin/mail-log', { params: { limit: 20 } })
    expect(items.value).toHaveLength(2)
    expect(hasNext.value).toBe(false)
    expect(hasPrevious.value).toBe(false)
  })

  it('sends only the filters that are set and resets to the first page', async () => {
    apiClient.get.mockResolvedValue({ data: { items: [], nextCursor: null } })
    const { setFilters, isFiltered } = useAdminMailLog()
    expect(isFiltered.value).toBe(false)

    await setFilters({ templateId: 'no_claims' })
    expect(apiClient.get).toHaveBeenLastCalledWith('/admin/mail-log', {
      params: { limit: 20, templateId: 'no_claims' },
    })

    await setFilters({ status: 'failed', q: 'anna' })
    expect(apiClient.get).toHaveBeenLastCalledWith('/admin/mail-log', {
      params: { limit: 20, templateId: 'no_claims', status: 'failed', q: 'anna' },
    })
    expect(isFiltered.value).toBe(true)

    await setFilters({ templateId: '', status: '', q: '' })
    expect(apiClient.get).toHaveBeenLastCalledWith('/admin/mail-log', { params: { limit: 20 } })
    expect(isFiltered.value).toBe(false)
  })

  it('walks forward with the cursor and back through the visited cursors', async () => {
    apiClient.get
      .mockResolvedValueOnce({ data: { items: [row(1)], nextCursor: 'c2' } })
      .mockResolvedValueOnce({ data: { items: [row(2)], nextCursor: 'c3' } })
      .mockResolvedValueOnce({ data: { items: [row(1)], nextCursor: 'c2' } })
    const { fetchLog, nextPage, previousPage, items, hasNext, hasPrevious } = useAdminMailLog()

    await fetchLog()
    expect(hasNext.value).toBe(true)
    expect(hasPrevious.value).toBe(false)

    await nextPage()
    expect(apiClient.get).toHaveBeenLastCalledWith('/admin/mail-log', {
      params: { limit: 20, cursor: 'c2' },
    })
    expect(items.value[0].email).toBe('u2@example.nl')
    expect(hasPrevious.value).toBe(true)

    await previousPage()
    // Back on page one: no cursor param, and no further "previous".
    expect(apiClient.get).toHaveBeenLastCalledWith('/admin/mail-log', { params: { limit: 20 } })
    expect(items.value[0].email).toBe('u1@example.nl')
    expect(hasPrevious.value).toBe(false)
  })

  it('ignores nextPage/previousPage when there is nowhere to go', async () => {
    apiClient.get.mockResolvedValue({ data: { items: [row(1)], nextCursor: null } })
    const { fetchLog, nextPage, previousPage } = useAdminMailLog()
    await fetchLog()
    apiClient.get.mockClear()

    await nextPage()
    await previousPage()

    expect(apiClient.get).not.toHaveBeenCalled()
  })

  it('starts over from page one when a filter changes on a later page', async () => {
    apiClient.get
      .mockResolvedValueOnce({ data: { items: [row(1)], nextCursor: 'c2' } })
      .mockResolvedValueOnce({ data: { items: [row(2)], nextCursor: null } })
      .mockResolvedValueOnce({ data: { items: [row(3)], nextCursor: null } })
    const { fetchLog, nextPage, setFilters, hasPrevious } = useAdminMailLog()
    await fetchLog()
    await nextPage()
    expect(hasPrevious.value).toBe(true)

    await setFilters({ status: 'failed' })

    expect(apiClient.get).toHaveBeenLastCalledWith('/admin/mail-log', {
      params: { limit: 20, status: 'failed' },
    })
    expect(hasPrevious.value).toBe(false)
  })

  it('sets error and clears loading when the request fails', async () => {
    apiClient.get.mockRejectedValue({ response: { data: { message: 'Forbidden' } } })
    const { fetchLog, error, loading } = useAdminMailLog()

    await fetchLog()

    expect(error.value).toBe('Forbidden')
    expect(loading.value).toBe(false)
  })
})
