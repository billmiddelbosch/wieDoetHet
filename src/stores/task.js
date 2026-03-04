import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/stores/auth'

export const useTaskStore = defineStore('task', () => {
  const tasks = ref([])

  function setTasks(data) {
    tasks.value = data.map(enrichTask)
  }

  function addTask(task) {
    tasks.value.push(enrichTask(task))
  }

  function updateTask(id, data) {
    const idx = tasks.value.findIndex((t) => t.id === id)
    if (idx !== -1) tasks.value[idx] = enrichTask({ ...tasks.value[idx], ...data })
  }

  function removeTask(id) {
    tasks.value = tasks.value.filter((t) => t.id !== id)
  }

  function applyClaim(taskId, claim) {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) return
    if (!task.claims) task.claims = []
    task.claims.push(claim)
    task.claimCount = task.claims.length
    task.isFull = !!task.maxClaims && task.claimCount >= task.maxClaims
    task.isClaimedByMe = true
  }

  function removeClaim(taskId, userIdOrSessionId) {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task || !task.claims) return
    task.claims = task.claims.filter(
      (c) => c.userId !== userIdOrSessionId && c.sessionId !== userIdOrSessionId
    )
    task.claimCount = task.claims.length
    task.isFull = !!task.maxClaims && task.claimCount >= task.maxClaims
    task.isClaimedByMe = false
  }

  return { tasks, setTasks, addTask, updateTask, removeTask, applyClaim, removeClaim }
})

function enrichTask(task) {
  const authStore = useAuthStore()
  const claims = task.claims ?? []
  const claimCount = claims.length
  const isFull = !!task.maxClaims && claimCount >= task.maxClaims
  const isClaimedByMe = claims.some(
    (c) =>
      (authStore.user && c.userId === authStore.user.id) ||
      (authStore.anonymousUser && c.sessionId === authStore.anonymousUser.sessionId)
  )
  return { ...task, claims, claimCount, isFull, isClaimedByMe }
}
