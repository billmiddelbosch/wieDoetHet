<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGroupStore } from '@/stores/group'
import { useAuthStore } from '@/stores/auth'
import { useGroups } from '@/composables/useGroups'
import { useTasks } from '@/composables/useTasks'
import { useClaims } from '@/composables/useClaims'
import ScorecardTable from '@/components/organisms/ScorecardTable.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const groupStore = useGroupStore()
const authStore = useAuthStore()
const { fetchGroup } = useGroups()
const { tasks, fetchTasks } = useTasks()
const { scorecard, fetchClaims, loading, error } = useClaims()

const group = computed(() => groupStore.currentGroup)

const canView = computed(() => {
  if (!group.value) return false
  const vis = group.value.scorecardVisibility
  if (vis === 'all') return true
  if (vis === 'initiator')
    return authStore.isAuthenticated && group.value.initiatorId === authStore.user?.id
  return false
})

async function load() {
  await fetchGroup(route.params.id)
  await fetchTasks(route.params.id)
  await fetchClaims(route.params.id)
}

onMounted(load)
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 sm:px-6 py-8">
    <!-- Back -->
    <button
      type="button"
      class="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6 transition-colors"
      @click="router.back()"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      {{ t('common.back') }}
    </button>

    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-primary)]">{{ t('scorecard.title') }}</h1>
        <p v-if="group" class="text-sm text-[var(--text-secondary)] mt-0.5">{{ group.name }}</p>
      </div>
      <BaseButton variant="secondary" size="sm" :loading="loading" @click="load">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        {{ t('scorecard.refresh') }}
      </BaseButton>
    </div>

    <div v-if="loading" class="flex justify-center py-20">
      <BaseSpinner size="lg" />
    </div>

    <BaseAlert v-else-if="!canView" variant="warning">
      {{ t('scorecard.notVisible') }}
    </BaseAlert>

    <BaseAlert v-else-if="error" variant="danger">{{ error }}</BaseAlert>

    <ScorecardTable v-else :rows="scorecard" :tasks="tasks" />
  </div>
</template>
