import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import apiClient from '@/lib/axios'
import { useAdminStore } from '@/stores/admin'

export function useAdminUsers() {
  const adminStore = useAdminStore()
  const { users, currentUser, usersNextCursor, usersTotalCount } = storeToRefs(adminStore)
  const loading = ref(false)
  const error = ref(null)

  const currentQuery = ref('')
  const currentCursor = ref(null)
  const cursorHistory = ref([])

  const hasNext = computed(() => usersNextCursor.value !== null)
  const hasPrevious = computed(() => cursorHistory.value.length > 0)

  async function fetchPage(cursor) {
    loading.value = true
    error.value = null
    try {
      const params = { limit: 20 }
      if (cursor) params.cursor = cursor
      if (currentQuery.value) params.q = currentQuery.value
      const { data } = await apiClient.get('/admin/users', { params })
      adminStore.setUsers(data.items, data.nextCursor, data.totalCount ?? 0)
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
    } finally {
      loading.value = false
    }
  }

  async function fetchUsers({ q } = {}) {
    currentQuery.value = q ?? ''
    currentCursor.value = null
    cursorHistory.value = []
    await fetchPage(null)
  }

  async function fetchNextPage() {
    if (!hasNext.value) return
    cursorHistory.value.push(currentCursor.value)
    currentCursor.value = usersNextCursor.value
    await fetchPage(currentCursor.value)
  }

  async function fetchPreviousPage() {
    if (!hasPrevious.value) return
    const previousCursor = cursorHistory.value.pop()
    currentCursor.value = previousCursor
    await fetchPage(previousCursor)
  }

  async function fetchUser(id) {
    loading.value = true
    error.value = null
    adminStore.setCurrentUser(null)
    try {
      const { data } = await apiClient.get(`/admin/users/${id}`)
      adminStore.setCurrentUser(data)
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
    } finally {
      loading.value = false
    }
  }

  // Toggle a user's e-mail opt-out. No optimistic UI: the switch only moves once
  // the server has confirmed, so a failed request never leaves it in a wrong state.
  // Resolves to true/false and leaves `error` alone: that ref drives the "user not
  // found" state of the detail page, which a failed toggle must not trigger.
  async function setMailOptOut(userId, optOut) {
    try {
      const { data } = await apiClient.patch(`/admin/users/${userId}/mail-opt-out`, { optOut })
      if (currentUser.value?.id === userId) {
        adminStore.setCurrentUser({
          ...currentUser.value,
          mailOptOut: data.mailOptOut,
          mailOptOutAt: data.mailOptOutAt ?? null,
        })
      }
      return true
    } catch {
      return false
    }
  }

  return {
    users,
    currentUser,
    usersTotalCount,
    currentQuery,
    loading,
    error,
    hasNext,
    hasPrevious,
    fetchUsers,
    fetchNextPage,
    fetchPreviousPage,
    fetchUser,
    setMailOptOut,
  }
}
