import { ref } from 'vue'
import apiClient from '@/lib/axios'

export function useReminder() {
  const loading = ref(false)
  const error = ref(null)

  /**
   * Fetch current reminder status for a task or group.
   * Returns { scheduledAt: string|null, status: string } or null on error.
   *
   * @param {'task'|'group'} scope
   * @param {string} id — taskId or groupId
   */
  async function fetchReminder(scope, id) {
    loading.value = true
    error.value = null
    try {
      const { data } = await apiClient.get(`/reminders/${scope}/${id}`)
      return data
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * Schedule a new reminder (or replace an existing one).
   * scheduledAt must be an ISO 8601 UTC string.
   *
   * @param {'task'|'group'} scope
   * @param {string} id — taskId or groupId
   * @param {string} scheduledAt — ISO 8601 UTC string
   * @param {string|null} groupId — required when scope is 'task'
   * @returns {object|null} the created reminder record, or null on error
   */
  async function scheduleReminder(scope, id, scheduledAt, groupId = null) {
    loading.value = true
    error.value = null
    try {
      const payload = { scope, id, scheduledAt }
      if (scope === 'task' && groupId) payload.groupId = groupId
      const { data } = await apiClient.post('/reminders', payload)
      return data
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * Cancel an existing reminder.
   * Returns true on success, false on error.
   *
   * @param {'task'|'group'} scope
   * @param {string} id — taskId or groupId
   */
  async function cancelReminder(scope, id) {
    loading.value = true
    error.value = null
    try {
      await apiClient.delete(`/reminders/${scope}/${id}`)
      return true
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
      return false
    } finally {
      loading.value = false
    }
  }

  return { loading, error, fetchReminder, scheduleReminder, cancelReminder }
}
