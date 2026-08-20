import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useAdminStore = defineStore('admin', () => {
  const stats = ref(null)
  const users = ref([])
  const usersNextCursor = ref(null)
  const currentUser = ref(null)
  const groups = ref([])
  const groupsNextCursor = ref(null)
  const currentGroup = ref(null)

  function setStats(data) {
    stats.value = data
  }

  function setUsers(data, nextCursor = null) {
    users.value = data
    usersNextCursor.value = nextCursor
  }

  function setCurrentUser(user) {
    currentUser.value = user
  }

  function setGroups(data, nextCursor = null) {
    groups.value = data
    groupsNextCursor.value = nextCursor
  }

  function setCurrentGroup(group) {
    currentGroup.value = group
  }

  return {
    stats,
    users,
    usersNextCursor,
    currentUser,
    groups,
    groupsNextCursor,
    currentGroup,
    setStats,
    setUsers,
    setCurrentUser,
    setGroups,
    setCurrentGroup,
  }
})
