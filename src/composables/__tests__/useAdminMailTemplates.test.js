import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import apiClient from '@/lib/axios'
import { useAdminStore } from '@/stores/admin'
import { useAdminMailTemplates } from '../useAdminMailTemplates'

vi.mock('@/lib/axios', () => ({
  default: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))

const welcome = { id: 'welcome', enabled: false, tier: 'timely', isCustomised: false }
const noGroup = { id: 'no_group', enabled: true, tier: 'normal', isCustomised: false }
const lastRun = { at: '2026-09-18T08:00:00Z', masterEnabled: true, sent: 3, failed: 0 }

describe('useAdminMailTemplates', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiClient.get.mockReset()
    apiClient.patch.mockReset()
    apiClient.post.mockReset()
  })

  describe('fetchTemplates', () => {
    it('loads the templates and the last run into the admin store', async () => {
      apiClient.get.mockResolvedValue({ data: { items: [welcome, noGroup], lastRun } })
      const { fetchTemplates, templates, lastRun: lastRunRef } = useAdminMailTemplates()

      await fetchTemplates()

      expect(apiClient.get).toHaveBeenCalledWith('/admin/mail-templates')
      expect(templates.value).toEqual([welcome, noGroup])
      expect(lastRunRef.value).toEqual(lastRun)
      expect(useAdminStore().mailTemplates).toEqual([welcome, noGroup])
    })

    it('keeps lastRun null when the scheduler has never run', async () => {
      apiClient.get.mockResolvedValue({ data: { items: [welcome], lastRun: null } })
      const { fetchTemplates, lastRun: lastRunRef } = useAdminMailTemplates()

      await fetchTemplates()

      expect(lastRunRef.value).toBeNull()
    })

    it('sets error and clears loading when the request fails', async () => {
      apiClient.get.mockRejectedValue({ response: { data: { message: 'Forbidden' } } })
      const { fetchTemplates, error, loading } = useAdminMailTemplates()

      await fetchTemplates()

      expect(error.value).toBe('Forbidden')
      expect(loading.value).toBe(false)
    })

    it('is shared between two composable instances through the store', async () => {
      apiClient.get.mockResolvedValue({ data: { items: [welcome], lastRun: null } })
      const page = useAdminMailTemplates()
      const modal = useAdminMailTemplates()

      await page.fetchTemplates()

      expect(modal.templates.value).toEqual([welcome])
    })
  })

  describe('setEnabled', () => {
    it('PATCHes { enabled } and replaces the template with the server response', async () => {
      apiClient.get.mockResolvedValue({ data: { items: [welcome, noGroup], lastRun: null } })
      const { fetchTemplates, setEnabled, templates } = useAdminMailTemplates()
      await fetchTemplates()
      apiClient.patch.mockResolvedValue({ data: { ...welcome, enabled: true } })

      const ok = await setEnabled('welcome', true)

      expect(apiClient.patch).toHaveBeenCalledWith('/admin/mail-templates/welcome', {
        enabled: true,
      })
      expect(ok).toBe(true)
      expect(templates.value.find((t) => t.id === 'welcome').enabled).toBe(true)
      expect(templates.value.find((t) => t.id === 'no_group')).toEqual(noGroup)
    })

    it('does not touch the list and resolves to false when the request fails', async () => {
      apiClient.get.mockResolvedValue({ data: { items: [welcome], lastRun: null } })
      const { fetchTemplates, setEnabled, templates, error } = useAdminMailTemplates()
      await fetchTemplates()
      apiClient.patch.mockRejectedValue(new Error('boom'))

      const ok = await setEnabled('welcome', true)

      expect(ok).toBe(false)
      expect(templates.value[0].enabled).toBe(false)
      // `error` belongs to the initial load — a failed toggle must not set it.
      expect(error.value).toBeNull()
    })

    it('marks the template as saving while the request is in flight', async () => {
      let resolve
      apiClient.patch.mockReturnValue(new Promise((r) => (resolve = r)))
      const { setEnabled, savingIds } = useAdminMailTemplates()

      const pending = setEnabled('welcome', true)
      expect(savingIds.value.has('welcome')).toBe(true)

      resolve({ data: { ...welcome, enabled: true } })
      await pending
      expect(savingIds.value.has('welcome')).toBe(false)
    })
  })

  describe('saveTemplate / resetTemplate', () => {
    it('saves a subject and body', async () => {
      apiClient.patch.mockResolvedValue({ data: { ...welcome, isCustomised: true } })
      const { saveTemplate } = useAdminMailTemplates()

      const result = await saveTemplate('welcome', { subject: 'Hoi', bodyHtml: '<p>Tekst</p>' })

      expect(apiClient.patch).toHaveBeenCalledWith('/admin/mail-templates/welcome', {
        subject: 'Hoi',
        bodyHtml: '<p>Tekst</p>',
      })
      expect(result).toEqual({ ok: true })
    })

    it('returns the server validation message on a 400', async () => {
      apiClient.patch.mockRejectedValue({
        response: {
          status: 400,
          data: { message: 'Onbekend of niet toegestaan veld: {{groupName}}' },
        },
      })
      const { saveTemplate } = useAdminMailTemplates()

      const result = await saveTemplate('welcome', {
        subject: 'Hoi',
        bodyHtml: '<p>{{groupName}}</p>',
      })

      expect(result).toEqual({
        ok: false,
        message: 'Onbekend of niet toegestaan veld: {{groupName}}',
      })
    })

    it('resets to the default text by sending null for both fields', async () => {
      apiClient.patch.mockResolvedValue({ data: welcome })
      const { resetTemplate } = useAdminMailTemplates()

      const result = await resetTemplate('welcome')

      expect(apiClient.patch).toHaveBeenCalledWith('/admin/mail-templates/welcome', {
        subject: null,
        bodyHtml: null,
      })
      expect(result.ok).toBe(true)
    })
  })

  describe('sendTest', () => {
    it('POSTs to the test endpoint and returns the address the mail went to', async () => {
      apiClient.post.mockResolvedValue({ data: { sent: true, to: 'admin@wiedoehet.nl' } })
      const { sendTest } = useAdminMailTemplates()

      const result = await sendTest('welcome')

      expect(apiClient.post).toHaveBeenCalledWith('/admin/mail-templates/welcome/test')
      expect(result).toEqual({ ok: true, to: 'admin@wiedoehet.nl' })
    })

    it('returns the SES failure message on a 502', async () => {
      apiClient.post.mockRejectedValue({
        response: { status: 502, data: { message: 'SES weigert' } },
      })
      const { sendTest, savingIds } = useAdminMailTemplates()

      const result = await sendTest('welcome')

      expect(result).toEqual({ ok: false, message: 'SES weigert' })
      expect(savingIds.value.size).toBe(0)
    })
  })
})
