import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import apiClient from '@/lib/axios'
import { useAdminStore } from '@/stores/admin'

const messageOf = (err) => err?.response?.data?.message ?? err.message

/**
 * Admin composable for the lifecycle-mail templates.
 *
 * The template list lives in the admin store so the templates page and its edit
 * modal (which each call this composable) see the same data. Mutations never
 * update optimistically: a template is only replaced once the server has
 * answered, so a failed request cannot leave the UI showing something that was
 * not saved.
 */
export function useAdminMailTemplates() {
  const adminStore = useAdminStore()
  const { mailTemplates: templates, mailLastRun: lastRun } = storeToRefs(adminStore)
  const loading = ref(false)
  const error = ref(null)
  // Ids with a request in flight — the UI disables that template's controls.
  const savingIds = ref(new Set())

  function setSaving(id, saving) {
    const next = new Set(savingIds.value)
    if (saving) next.add(id)
    else next.delete(id)
    savingIds.value = next
  }

  async function fetchTemplates() {
    loading.value = true
    error.value = null
    try {
      const { data } = await apiClient.get('/admin/mail-templates')
      adminStore.setMailTemplates(data.items ?? [], data.lastRun ?? null)
    } catch (err) {
      error.value = messageOf(err)
    } finally {
      loading.value = false
    }
  }

  async function patchTemplate(id, body) {
    setSaving(id, true)
    try {
      const { data } = await apiClient.patch(`/admin/mail-templates/${id}`, body)
      adminStore.replaceMailTemplate(data)
      return { ok: true }
    } catch (err) {
      return { ok: false, message: messageOf(err) }
    } finally {
      setSaving(id, false)
    }
  }

  /**
   * Switch one template on or off. Resolves to true when the server accepted it.
   * A failure is reported through the return value only: `error` is reserved for
   * the initial load, so a failed toggle must not replace the whole page with it.
   */
  async function setEnabled(id, enabled) {
    const result = await patchTemplate(id, { enabled })
    return result.ok
  }

  /** Save an edited subject + body. Resolves to `{ ok, message? }` (message = server validation text). */
  function saveTemplate(id, { subject, bodyHtml }) {
    return patchTemplate(id, { subject, bodyHtml })
  }

  /** Drop the custom text and fall back to the built-in default. */
  function resetTemplate(id) {
    return patchTemplate(id, { subject: null, bodyHtml: null })
  }

  /** Send the template, rendered with sample data, to the signed-in admin. */
  async function sendTest(id) {
    setSaving(id, true)
    try {
      const { data } = await apiClient.post(`/admin/mail-templates/${id}/test`)
      return { ok: true, to: data.to }
    } catch (err) {
      return { ok: false, message: messageOf(err) }
    } finally {
      setSaving(id, false)
    }
  }

  return {
    templates,
    lastRun,
    loading,
    error,
    savingIds,
    fetchTemplates,
    setEnabled,
    saveTemplate,
    resetTemplate,
    sendTest,
  }
}
