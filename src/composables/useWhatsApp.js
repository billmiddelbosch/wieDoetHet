import { ref } from 'vue'
import apiClient from '@/lib/axios.js'

export function useWhatsApp() {
  const loading = ref(false)
  const error = ref(null)
  const sent = ref(false)

  async function sendPoll(groupId, to, tasks) {
    loading.value = true
    error.value = null
    sent.value = false
    try {
      await apiClient.post(`/groups/${groupId}/whatsapp-poll`, { to, tasks })
      sent.value = true
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
    } finally {
      loading.value = false
    }
  }

  return { loading, error, sent, sendPoll }
}
