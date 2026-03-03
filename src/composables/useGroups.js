import { ref } from 'vue'
import apiClient from '@/lib/axios'
import { useGroupStore } from '@/stores/group'

export function useGroups() {
  const groupStore = useGroupStore()
  const loading = ref(false)
  const error = ref(null)

  async function fetchGroups() {
    loading.value = true
    error.value = null
    try {
      const { data } = await apiClient.get('/groups')
      groupStore.setGroups(data)
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
    } finally {
      loading.value = false
    }
  }

  async function fetchGroup(id) {
    loading.value = true
    error.value = null
    try {
      const { data } = await apiClient.get(`/groups/${id}`)
      groupStore.setCurrentGroup(data)
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
    } finally {
      loading.value = false
    }
  }

  async function fetchGroupByShareToken(token) {
    loading.value = true
    error.value = null
    try {
      const { data } = await apiClient.get(`/groups/share/${token}`)
      groupStore.setCurrentGroup(data)
      return data
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
      return null
    } finally {
      loading.value = false
    }
  }

  async function createGroup(payload) {
    loading.value = true
    error.value = null
    try {
      const { data } = await apiClient.post('/groups', payload)
      groupStore.addGroup(data)
      return data
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateGroup(id, payload) {
    loading.value = true
    error.value = null
    try {
      const { data } = await apiClient.patch(`/groups/${id}`, payload)
      groupStore.updateGroup(id, data)
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
    } finally {
      loading.value = false
    }
  }

  async function deleteGroup(id) {
    loading.value = true
    error.value = null
    try {
      await apiClient.delete(`/groups/${id}`)
      groupStore.removeGroup(id)
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
    } finally {
      loading.value = false
    }
  }

  return {
    groups: groupStore.groups,
    currentGroup: groupStore.currentGroup,
    loading,
    error,
    fetchGroups,
    fetchGroup,
    fetchGroupByShareToken,
    createGroup,
    updateGroup,
    deleteGroup,
  }
}
