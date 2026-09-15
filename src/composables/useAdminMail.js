import { ref } from 'vue'
import apiClient from '@/lib/axios'

/**
 * Composable for sending admin-triggered bulk email via POST /admin/mail.
 *
 * Two selection modes, mirroring the backend contract in
 * product/specs/admin-api.spec.md:
 *   - { userIds: string[] }              — explicit recipient list (rows checked by hand)
 *   - { selectAll: true, q }             — "select all N matching current filter";
 *     the server re-runs the same search filter, never trusting a client-built ID list
 *     for this case.
 *
 * Returns the aggregate result `{ sent, failed, failures }` on success, or `null`
 * on a request-level failure (network error, 400, 401, 403) with `error` set.
 */
export function useAdminMail() {
  const loading = ref(false)
  const error = ref(null)

  async function sendMail({ userIds, selectAll = false, q, subject, html }) {
    loading.value = true
    error.value = null
    try {
      const payload = selectAll ? { selectAll: true, q, subject, html } : { userIds, subject, html }
      const { data } = await apiClient.post('/admin/mail', payload)
      return data
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
      return null
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    sendMail,
  }
}
