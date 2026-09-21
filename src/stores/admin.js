import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useAdminStore = defineStore('admin', () => {
  const stats = ref(null)
  const users = ref([])
  const usersNextCursor = ref(null)
  const usersTotalCount = ref(0)
  const currentUser = ref(null)
  const groups = ref([])
  const groupsNextCursor = ref(null)
  const currentGroup = ref(null)
  // Lifecycle-mail templates. Kept in the store (not in the composable) because
  // the templates page and its edit modal each call the composable and must see
  // the same list.
  const mailTemplates = ref([])
  const mailLastRun = ref(null)
  // Lifecycle-mail master switch (stored in the table, toggled from the admin panel).
  const mailMaster = ref({ enabled: false, updatedAt: null, updatedBy: null })

  function setStats(data) {
    stats.value = data
  }

  function setUsers(data, nextCursor = null, totalCount = 0) {
    users.value = data
    usersNextCursor.value = nextCursor
    usersTotalCount.value = totalCount
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

  function setMailTemplates(items, lastRun = null, master = null) {
    mailTemplates.value = items
    mailLastRun.value = lastRun
    // An older backend has no `master`: treat that as off, like the server does.
    mailMaster.value = master ?? { enabled: false, updatedAt: null, updatedBy: null }
  }

  function setMailMaster(master) {
    mailMaster.value = master
  }

  function replaceMailTemplate(updated) {
    mailTemplates.value = mailTemplates.value.map((tpl) => (tpl.id === updated.id ? updated : tpl))
  }

  return {
    stats,
    users,
    usersNextCursor,
    usersTotalCount,
    currentUser,
    groups,
    groupsNextCursor,
    currentGroup,
    mailTemplates,
    mailLastRun,
    mailMaster,
    setStats,
    setUsers,
    setCurrentUser,
    setGroups,
    setCurrentGroup,
    setMailTemplates,
    setMailMaster,
    replaceMailTemplate,
  }
})
