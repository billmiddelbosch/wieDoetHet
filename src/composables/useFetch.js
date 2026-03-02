import { ref } from 'vue'
import apiClient from '@/lib/axios'

/**
 * Composable for making API requests with loading and error state.
 *
 * @param {string} url - The API endpoint path
 * @returns {{ data, loading, error, execute }}
 */
export function useFetch(url) {
  const data = ref(null)
  const loading = ref(false)
  const error = ref(null)

  async function execute(options = {}) {
    loading.value = true
    error.value = null
    try {
      const response = await apiClient({ url, ...options })
      data.value = response.data
    } catch (err) {
      error.value = err
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, execute }
}
