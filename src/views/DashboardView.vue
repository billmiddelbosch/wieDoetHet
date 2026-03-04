<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGroups } from '@/composables/useGroups'
import { useGroupStore } from '@/stores/group'
import GroupCard from '@/components/molecules/GroupCard.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'

const { t } = useI18n()
const router = useRouter()
const { fetchGroups, loading, error } = useGroups()
const groupStore = useGroupStore()

const groups = computed(() => groupStore.groups)

onMounted(() => fetchGroups())

function openGroup(group) {
  router.push(`/groups/${group.id}`)
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 sm:px-6 py-8">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-[var(--text-primary)]">{{ t('dashboard.title') }}</h1>
        <p class="text-sm text-[var(--text-secondary)] mt-0.5">{{ t('dashboard.subtitle') }}</p>
      </div>
      <BaseButton variant="primary" @click="router.push('/groups/new')">
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        {{ t('groups.new') }}
      </BaseButton>
    </div>

    <div v-if="loading" class="flex justify-center py-20">
      <BaseSpinner size="lg" />
    </div>

    <div v-else-if="error" class="text-center py-12 text-danger-600 text-sm">
      {{ t('common.loadError') }}: {{ error }}
    </div>

    <template v-else>
      <BaseEmptyState
        v-if="groups.length === 0"
        :title="t('dashboard.emptyTitle')"
        :description="t('dashboard.emptyDesc')"
      >
        <template #actions>
          <BaseButton variant="primary" @click="router.push('/groups/new')">
            {{ t('groups.createFirst') }}
          </BaseButton>
        </template>
      </BaseEmptyState>

      <div v-else class="flex flex-col gap-4">
        <GroupCard v-for="group in groups" :key="group.id" :group="group" @click="openGroup" />
      </div>
    </template>
  </div>
</template>
