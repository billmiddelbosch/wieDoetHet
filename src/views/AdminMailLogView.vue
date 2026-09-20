<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdminMailLog } from '@/composables/useAdminMailLog'
import { useHead } from '@/composables/useHead'
import { formatDateTime } from '@/utils'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import AdminAutomationTabs from '@/components/molecules/AdminAutomationTabs.vue'

const { t, locale } = useI18n()

useHead({
  title: t('seo.adminMailLog.title'),
  noindex: true,
})

const {
  items,
  loading,
  error,
  filters,
  isFiltered,
  hasNext,
  hasPrevious,
  fetchLog,
  setFilters,
  nextPage,
  previousPage,
} = useAdminMailLog()

// Keep in sync with the ids the API accepts (lambda/shared/lifecycle-templates.js).
const TEMPLATE_IDS = [
  'welcome',
  'no_group',
  'no_tasks',
  'no_claims',
  'day_after_event',
  'dormant_30',
  'dormant_60',
]
const STATUSES = ['sent', 'failed', 'sending']
const STATUS_VARIANT = { sent: 'success', failed: 'danger', sending: 'warning' }

const q = ref('')
let debounceTimer = null

onMounted(() => fetchLog())
onUnmounted(() => clearTimeout(debounceTimer))

// Same 300 ms debounce as the users search.
watch(q, (value) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => setFilters({ q: value.trim() }), 300)
})

const dateLocale = computed(() => (locale.value === 'en' ? 'en-GB' : 'nl-NL'))

const columns = computed(() => [
  { key: 'sentAt', label: t('admin.mailLog.columnSentAt') },
  { key: 'email', label: t('admin.mailLog.columnRecipient') },
  { key: 'templateId', label: t('admin.mailLog.columnTemplate') },
  { key: 'subject', label: t('admin.mailLog.columnSubject') },
  { key: 'status', label: t('admin.mailLog.columnStatus') },
  { key: 'attempts', label: t('admin.mailLog.columnAttempts'), align: 'right' },
])
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-8">
    <h1 class="text-2xl font-bold text-[var(--text-primary)] mb-6">
      {{ t('admin.mailLog.title') }}
    </h1>

    <AdminAutomationTabs active="log" />

    <div class="mb-4 flex flex-wrap items-end gap-4">
      <div class="flex flex-col gap-1">
        <label for="log-template" class="text-xs font-medium text-[var(--text-secondary)]">
          {{ t('admin.mailLog.filterTemplate') }}
        </label>
        <select
          id="log-template"
          :value="filters.templateId"
          class="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
          @change="setFilters({ templateId: $event.target.value })"
        >
          <option value="">{{ t('admin.mailLog.allTemplates') }}</option>
          <option v-for="id in TEMPLATE_IDS" :key="id" :value="id">
            {{ t(`admin.automation.templates.${id}.name`) }}
          </option>
        </select>
      </div>

      <div class="flex flex-col gap-1">
        <label for="log-status" class="text-xs font-medium text-[var(--text-secondary)]">
          {{ t('admin.mailLog.filterStatus') }}
        </label>
        <select
          id="log-status"
          :value="filters.status"
          class="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
          @change="setFilters({ status: $event.target.value })"
        >
          <option value="">{{ t('admin.mailLog.allStatuses') }}</option>
          <option v-for="status in STATUSES" :key="status" :value="status">
            {{ t(`admin.mailLog.status.${status}`) }}
          </option>
        </select>
      </div>

      <div class="w-full sm:w-72">
        <BaseInput v-model="q" :placeholder="t('admin.mailLog.searchPlaceholder')" />
      </div>
    </div>

    <BaseAlert v-if="error" variant="danger" class="mb-4">{{
      t('admin.mailLog.loadError')
    }}</BaseAlert>

    <BaseTable
      :columns="columns"
      :rows="items"
      :loading="loading"
      :empty-message="isFiltered ? t('admin.mailLog.noResults') : t('admin.mailLog.empty')"
    >
      <template #cell-sentAt="{ row }">
        <span class="whitespace-nowrap">{{
          formatDateTime(row.sentAt ?? row.createdAt, dateLocale)
        }}</span>
      </template>
      <template #cell-email="{ row }">
        <p>{{ row.email }}</p>
        <p v-if="row.userName" class="text-xs text-[var(--text-tertiary)]">{{ row.userName }}</p>
      </template>
      <template #cell-templateId="{ row }">
        <p>{{ t(`admin.automation.templates.${row.templateId}.name`) }}</p>
        <p v-if="row.groupName" class="text-xs text-[var(--text-tertiary)]">{{ row.groupName }}</p>
      </template>
      <template #cell-status="{ row }">
        <BaseBadge :variant="STATUS_VARIANT[row.status] ?? 'neutral'" size="sm">
          {{ t(`admin.mailLog.status.${row.status}`) }}
        </BaseBadge>
        <p
          v-if="row.status === 'failed' && row.errorMessage"
          class="mt-1 text-xs text-[var(--text-tertiary)]"
        >
          {{ row.errorMessage }}
        </p>
      </template>
    </BaseTable>

    <div class="mt-4">
      <BasePagination
        :has-previous="hasPrevious"
        :has-next="hasNext"
        :loading="loading"
        :previous-label="t('admin.pagination.previous')"
        :next-label="t('admin.pagination.next')"
        @previous="previousPage"
        @next="nextPage"
      />
    </div>
  </div>
</template>
