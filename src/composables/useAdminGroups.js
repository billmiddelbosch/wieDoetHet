import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import apiClient from '@/lib/axios'
import { useAdminStore } from '@/stores/admin'

export function useAdminGroups() {
  const adminStore = useAdminStore()
  const { groups, currentGroup, groupsNextCursor } = storeToRefs(adminStore)
  const loading = ref(false)
  const error = ref(null)

  const currentQuery = ref('')
  const currentCursor = ref(null)
  const cursorHistory = ref([])

  const hasNext = computed(() => groupsNextCursor.value !== null)
  const hasPrevious = computed(() => cursorHistory.value.length > 0)

  async function fetchPage(cursor) {
    loading.value = true
    error.value = null
    try {
      const params = { limit: 20 }
      if (cursor) params.cursor = cursor
      if (currentQuery.value) params.q = currentQuery.value
      const { data } = await apiClient.get('/admin/groups', { params })
      adminStore.setGroups(data.items, data.nextCursor)
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
    } finally {
      loading.value = false
    }
  }

  async function fetchGroups({ q } = {}) {
    currentQuery.value = q ?? ''
    currentCursor.value = null
    cursorHistory.value = []
    await fetchPage(null)
  }

  async function fetchNextPage() {
    if (!hasNext.value) return
    cursorHistory.value.push(currentCursor.value)
    currentCursor.value = groupsNextCursor.value
    await fetchPage(currentCursor.value)
  }

  async function fetchPreviousPage() {
    if (!hasPrevious.value) return
    const previousCursor = cursorHistory.value.pop()
    currentCursor.value = previousCursor
    await fetchPage(previousCursor)
  }

  async function fetchGroup(id) {
    loading.value = true
    error.value = null
    adminStore.setCurrentGroup(null)
    try {
      const { data } = await apiClient.get(`/admin/groups/${id}`)
      adminStore.setCurrentGroup(data)
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
    } finally {
      loading.value = false
    }
  }

  return {
    groups,
    currentGroup,
    loading,
    error,
    hasNext,
    hasPrevious,
    fetchGroups,
    fetchNextPage,
    fetchPreviousPage,
    fetchGroup,
  }
}
