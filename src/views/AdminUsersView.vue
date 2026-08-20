<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAdminUsers } from '@/composables/useAdminUsers'
import { useHead } from '@/composables/useHead'
import { formatDate } from '@/utils'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'

const { t } = useI18n()
const router = useRouter()

useHead({
  title: t('seo.adminUsers.title'),
  noindex: true,
})

const { users, loading, error, hasNext, hasPrevious, fetchUsers, fetchNextPage, fetchPreviousPage } =
  useAdminUsers()

const q = ref('')
let debounceTimer = null

onMounted(() => fetchUsers())
onUnmounted(() => clearTimeout(debounceTimer))

watch(q, (value) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchUsers({ q: value }), 300)
})

const columns = computed(() => [
  { key: 'email', label: t('admin.users.columnEmail') },
  { key: 'name', label: t('admin.users.columnName') },
  { key: 'role', label: t('admin.users.columnRole') },
  { key: 'createdAt', label: t('admin.users.columnCreatedAt') },
  { key: 'groupCount', label: t('admin.users.columnGroupCount'), align: 'right' },
  { key: 'lastActivityAt', label: t('admin.users.columnLastActivity') },
])

function openUser(user) {
  router.push(`/admin/users/${user.id}`)
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-8">
    <h1 class="text-2xl font-bold text-[var(--text-primary)] mb-6">{{ t('admin.users.title') }}</h1>

    <div class="mb-4 max-w-sm">
      <BaseInput v-model="q" :placeholder="t('admin.users.searchPlaceholder')" />
    </div>

    <BaseAlert v-if="error" variant="danger" class="mb-4">{{ t('common.loadError') }}: {{ error }}</BaseAlert>

    <BaseTable
      :columns="columns"
      :rows="users"
      :loading="loading"
      :empty-message="t('admin.users.emptyDesc')"
      @row-click="openUser"
    >
      <template #empty>
        <p class="font-medium text-[var(--text-primary)]">{{ t('admin.users.emptyTitle') }}</p>
        <p class="text-[var(--text-tertiary)] mt-1">{{ t('admin.users.emptyDesc') }}</p>
      </template>
      <template #cell-role="{ value }">
        <BaseBadge :variant="value === 'admin' ? 'brand' : 'neutral'" size="sm">
          {{ t(`admin.roles.${value}`) }}
        </BaseBadge>
      </template>
      <template #cell-createdAt="{ value }">{{ formatDate(value) }}</template>
      <template #cell-lastActivityAt="{ value }">{{ formatDate(value) }}</template>
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
