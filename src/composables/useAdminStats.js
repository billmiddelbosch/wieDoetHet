import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import apiClient from '@/lib/axios'
import { useAdminStore } from '@/stores/admin'

export function useAdminStats() {
  const adminStore = useAdminStore()
  const { stats } = storeToRefs(adminStore)
  const loading = ref(false)
  const error = ref(null)

  async function fetchStats() {
    loading.value = true
    error.value = null
    try {
      const { data } = await apiClient.get('/admin/stats')
      adminStore.setStats(data)
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
    } finally {
      loading.value = false
    }
  }

  return {
    stats,
    loading,
    error,
    fetchStats,
  }
}
