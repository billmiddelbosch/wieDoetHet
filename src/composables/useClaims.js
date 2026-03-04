import { ref } from 'vue'
import apiClient from '@/lib/axios'
import { useTaskStore } from '@/stores/task'
import { useAuthStore } from '@/stores/auth'

export function useClaims() {
  const taskStore = useTaskStore()
  const authStore = useAuthStore()
  const scorecard = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function claimTask(groupId, taskId, anonymousName = null) {
    const payload = {}
    if (!authStore.isAuthenticated) {
      const name = anonymousName ?? authStore.anonymousUser?.name
      if (!name) throw new Error('Name required for anonymous claim')
      payload.anonymousName = name
      payload.sessionId = authStore.anonymousUser?.sessionId
    }

    const { data } = await apiClient.post(`/groups/${groupId}/tasks/${taskId}/claim`, payload)
    taskStore.applyClaim(taskId, data)
  }

  async function unclaimTask(groupId, taskId) {
    const body = !authStore.isAuthenticated && authStore.anonymousUser?.sessionId
      ? { data: { sessionId: authStore.anonymousUser.sessionId } }
      : {}
    await apiClient.delete(`/groups/${groupId}/tasks/${taskId}/claim`, body)
    taskStore.removeClaim(
      taskId,
      authStore.isAuthenticated ? authStore.user?.id : authStore.anonymousUser?.sessionId
    )
  }

  async function fetchClaims(groupId) {
    loading.value = true
    error.value = null
    try {
      const { data } = await apiClient.get(`/groups/${groupId}/claims`)
      scorecard.value = data
      return data
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
      return []
    } finally {
      loading.value = false
    }
  }

  return { scorecard, loading, error, claimTask, unclaimTask, fetchClaims }
}
