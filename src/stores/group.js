import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useGroupStore = defineStore('group', () => {
  const groups = ref([])
  const currentGroup = ref(null)

  const groupById = computed(() => (id) => groups.value.find((g) => g.id === id) ?? null)

  function setGroups(data) {
    groups.value = data
  }

  function setCurrentGroup(group) {
    currentGroup.value = group
  }

  function addGroup(group) {
    groups.value.unshift(group)
  }

  function updateGroup(id, data) {
    const idx = groups.value.findIndex((g) => g.id === id)
    if (idx !== -1) groups.value[idx] = { ...groups.value[idx], ...data }
    if (currentGroup.value?.id === id) {
      currentGroup.value = { ...currentGroup.value, ...data }
    }
  }

  function removeGroup(id) {
    groups.value = groups.value.filter((g) => g.id !== id)
    if (currentGroup.value?.id === id) currentGroup.value = null
  }

  return {
    groups,
    currentGroup,
    groupById,
    setGroups,
    setCurrentGroup,
    addGroup,
    updateGroup,
    removeGroup,
  }
})
