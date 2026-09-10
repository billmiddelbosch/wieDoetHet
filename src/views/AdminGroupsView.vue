<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAdminGroups } from '@/composables/useAdminGroups'
import { useHead } from '@/composables/useHead'
import { formatDate } from '@/utils'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'

const { t } = useI18n()
const router = useRouter()

useHead({
  title: t('seo.adminGroups.title'),
  noindex: true,
})

const { groups, loading, error, hasNext, hasPrevious, fetchGroups, fetchNextPage, fetchPreviousPage } =
  useAdminGroups()

const q = ref('')
let debounceTimer = null

onMounted(() => fetchGroups())
onUnmounted(() => clearTimeout(debounceTimer))

watch(q, (value) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchGroups({ q: value }), 300)
})

const columns = computed(() => [
  { key: 'name', label: t('admin.groups.columnName') },
  { key: 'initiatorName', label: t('admin.groups.columnInitiator') },
  { key: 'taskCount', label: t('admin.groups.columnTaskCount'), align: 'right' },
  { key: 'memberCount', label: t('admin.groups.columnMemberCount'), align: 'right' },
  { key: 'createdAt', label: t('admin.groups.columnCreatedAt') },
])

function openGroup(group) {
  router.push(`/admin/groups/${group.id}`)
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-8">
    <h1 class="text-2xl font-bold text-[var(--text-primary)] mb-6">{{ t('admin.groups.title') }}</h1>

    <div class="mb-4 max-w-sm">
      <BaseInput v-model="q" :placeholder="t('admin.groups.searchPlaceholder')" />
    </div>

    <BaseAlert v-if="error" variant="danger" class="mb-4">{{ t('common.loadError') }}: {{ error }}</BaseAlert>

    <BaseTable
      :columns="columns"
      :rows="groups"
      :loading="loading"
      :empty-message="t('admin.groups.emptyDesc')"
      @row-click="openGroup"
    >
      <template #empty>
        <p class="font-medium text-[var(--text-primary)]">{{ t('admin.groups.emptyTitle') }}</p>
        <p class="text-[var(--text-tertiary)] mt-1">{{ t('admin.groups.emptyDesc') }}</p>
      </template>
      <template #cell-initiatorName="{ row }">
        <div>
          <p class="text-[var(--text-primary)]">{{ row.initiatorName }}</p>
          <p class="text-xs text-[var(--text-tertiary)]">{{ row.initiatorEmail }}</p>
        </div>
      </template>
      <template #cell-createdAt="{ value }">{{ formatDate(value) }}</template>
    </BaseTable>

    <div class="mt-4">
      <BasePagination
        :has-previous="hasPrevious"
        :has-next="hasNext"
        :loading="loading"
        :previous-label="t('admin.pagination.previous')"
        :next-label="t('admin.pagination.next')"
        @previous="fetchPreviousPage"
        @next="fetchNextPage"
      />
    </div>
  </div>
</template>
