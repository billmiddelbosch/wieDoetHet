import { ref, computed } from 'vue'
import apiClient from '@/lib/axios'

const PAGE_SIZE = 20

/**
 * Admin composable for the lifecycle-mail sent log.
 *
 * Cursor pagination with a stack of the cursors already visited, so "previous"
 * is possible although the API only hands out a `nextCursor`. Any filter change
 * resets the stack and starts again from the first page.
 */
export function useAdminMailLog() {
  const items = ref([])
  const loading = ref(false)
  const error = ref(null)
  const filters = ref({ templateId: '', status: '', q: '' })

  const nextCursor = ref(null)
  const currentCursor = ref(null)
  const cursorHistory = ref([])

  const hasNext = computed(() => nextCursor.value !== null)
  const hasPrevious = computed(() => cursorHistory.value.length > 0)
  const isFiltered = computed(() => Object.values(filters.value).some((v) => v !== ''))

  async function fetchPage(cursor) {
    loading.value = true
    error.value = null
    try {
      const params = { limit: PAGE_SIZE }
      const { templateId, status, q } = filters.value
      if (templateId) params.templateId = templateId
      if (status) params.status = status
      if (q) params.q = q
      if (cursor) params.cursor = cursor
      const { data } = await apiClient.get('/admin/mail-log', { params })
      items.value = data.items ?? []
      nextCursor.value = data.nextCursor ?? null
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
    } finally {
      loading.value = false
    }
  }

  async function fetchLog() {
    currentCursor.value = null
    cursorHistory.value = []
    await fetchPage(null)
  }

  /** Merge a partial filter change and reload from the first page. */
  async function setFilters(partial) {
    filters.value = { ...filters.value, ...partial }
    await fetchLog()
  }

  async function nextPage() {
    if (!hasNext.value) return
    cursorHistory.value.push(currentCursor.value)
    currentCursor.value = nextCursor.value
    await fetchPage(currentCursor.value)
  }

  async function previousPage() {
    if (!hasPrevious.value) return
    currentCursor.value = cursorHistory.value.pop()
    await fetchPage(currentCursor.value)
  }

  return {
    items,
    loading,
    error,
    filters,
    isFiltered,
    hasNext,
    hasPrevious,
    fetchLog,
    setFilters,
    nextPage,
    previousPage,
  }
}
