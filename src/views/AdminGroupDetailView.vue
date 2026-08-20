<script setup>
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAdminGroups } from '@/composables/useAdminGroups'
import { useAdminStore } from '@/stores/admin'
import { useHead } from '@/composables/useHead'
import { formatDate } from '@/utils'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseTable from '@/components/ui/BaseTable.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const adminStore = useAdminStore()

useHead({
  title: t('seo.adminGroupDetail.title'),
  noindex: true,
})

const { currentGroup, loading, error, fetchGroup } = useAdminGroups()

onMounted(() => fetchGroup(route.params.id))
onUnmounted(() => adminStore.setCurrentGroup(null))
watch(() => route.params.id, (id) => { if (id) fetchGroup(id) })

const taskColumns = computed(() => [
  { key: 'title', label: t('admin.groupDetail.columnTask') },
  { key: 'claimedBy', label: t('admin.groupDetail.columnClaimedBy') },
  { key: 'status', label: t('admin.groupDetail.columnStatus') },
])

function shareUrl(shareToken) {
  return `${window.location.origin}/g/${shareToken}`
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 sm:px-6 py-8">
    <button
      type="button"
      class="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4"
      @click="router.push('/admin/groups')"
    >
      &larr; {{ t('admin.groupDetail.back') }}
    </button>

    <div v-if="loading" class="flex justify-center py-20">
      <BaseSpinner size="lg" />
    </div>

    <div v-else-if="error" class="py-6">
      <BaseAlert variant="danger">{{ t('admin.groupDetail.notFound') }}</BaseAlert>
    </div>

    <template v-else-if="currentGroup">
      <BaseCard padding="md" class="mb-6">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h1 class="text-xl font-bold text-[var(--text-primary)]">{{ currentGroup.name }}</h1>
            <p class="text-sm text-[var(--text-secondary)]">
              {{ currentGroup.initiatorName }} &middot; {{ currentGroup.initiatorEmail }}
            </p>
          </div>
          <BaseBadge variant="neutral">
            {{ t(`groups.visibility.${currentGroup.scorecardVisibility}`) }}
          </BaseBadge>
        </div>
        <dl class="grid grid-cols-2 gap-4 mt-5 text-sm">
          <div>
            <dt class="text-[var(--text-tertiary)]">{{ t('admin.groups.columnCreatedAt') }}</dt>
            <dd class="text-[var(--text-primary)] font-medium mt-0.5">{{ formatDate(currentGroup.createdAt) }}</dd>
          </div>
          <div>
            <dt class="text-[var(--text-tertiary)]">{{ t('groups.share') }}</dt>
            <dd class="text-[var(--text-primary)] font-medium mt-0.5 truncate">
              {{ shareUrl(currentGroup.shareToken) }}
            </dd>
          </div>
        </dl>
      </BaseCard>

      <h2 class="font-semibold text-[var(--text-primary)] mb-3">{{ t('admin.groupDetail.tasksTitle') }}</h2>
      <BaseTable
        :columns="taskColumns"
        :rows="currentGroup.tasks ?? []"
        :empty-message="t('tasks.emptyInitiator')"
      >
        <template #cell-claimedBy="{ value }">
          {{ value ?? '—' }}
        </template>
        <template #cell-status="{ row }">
          <BaseBadge :variant="row.claimedBy ? 'success' : 'neutral'" size="sm">
            {{ row.claimedBy ? t('admin.groupDetail.claimed') : t('admin.groupDetail.unclaimed') }}
          </BaseBadge>
        </template>
      </BaseTable>
    </template>
  </div>
</template>
