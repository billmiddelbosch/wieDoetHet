import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import apiClient from '@/lib/axios'
import { useTaskStore } from '@/stores/task'

export function useTasks() {
  const taskStore = useTaskStore()
  const { tasks } = storeToRefs(taskStore)
  const loading = ref(false)
  const error = ref(null)

  async function fetchTasks(groupId) {
    taskStore.setTasks([])
    loading.value = true
    error.value = null
    try {
      const { data } = await apiClient.get(`/groups/${groupId}/tasks`)
      taskStore.setTasks(data)
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
    } finally {
      loading.value = false
    }
  }

  async function createTask(groupId, payload) {
    loading.value = true
    error.value = null
    try {
      const { data } = await apiClient.post(`/groups/${groupId}/tasks`, payload)
      taskStore.addTask(data)
      return data
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateTask(groupId, taskId, payload) {
    loading.value = true
    error.value = null
    try {
      const { data } = await apiClient.patch(`/groups/${groupId}/tasks/${taskId}`, payload)
      taskStore.updateTask(taskId, data)
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
    } finally {
      loading.value = false
    }
  }

  async function deleteTask(groupId, taskId) {
    loading.value = true
    error.value = null
    try {
      await apiClient.delete(`/groups/${groupId}/tasks/${taskId}`)
      taskStore.removeTask(taskId)
    } catch (err) {
      error.value = err?.response?.data?.message ?? err.message
    } finally {
      loading.value = false
    }
  }

  function clearTasks() {
    taskStore.setTasks([])
  }

  return {
    tasks,
    loading,
    error,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    clearTasks,
  }
}
