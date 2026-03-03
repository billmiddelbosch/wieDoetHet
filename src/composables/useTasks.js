import { ref } from 'vue'
import apiClient from '@/lib/axios'
import { useTaskStore } from '@/stores/task'

export function useTasks() {
  const taskStore = useTaskStore()
  const loading = ref(false)
  const error = ref(null)

  async function fetchTasks(groupId) {
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

  return {
    tasks: taskStore.tasks,
    loading,
    error,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
  }
}
