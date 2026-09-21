<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAdminUsers } from '@/composables/useAdminUsers'
import { useAdminMail } from '@/composables/useAdminMail'
import { useHead } from '@/composables/useHead'
import { formatDate } from '@/utils'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import AdminSelectionToolbar from '@/components/molecules/AdminSelectionToolbar.vue'
import AdminMailComposeModal from '@/components/organisms/AdminMailComposeModal.vue'

const { t } = useI18n()
const router = useRouter()

useHead({
  title: t('seo.adminUsers.title'),
  noindex: true,
})

const {
  users,
  usersTotalCount,
  currentQuery,
  loading,
  error,
  hasNext,
  hasPrevious,
  fetchUsers,
  fetchNextPage,
  fetchPreviousPage,
} = useAdminUsers()

const { sendMail, loading: mailLoading, error: mailError } = useAdminMail()

const q = ref('')
let debounceTimer = null

// Selection state for bulk mail. Two mutually exclusive modes, mirroring the
// backend contract (POST /admin/mail accepts either `userIds` or
// `{ selectAll: true, q }`):
//   - selectedIds:  explicit set of row ids checked by hand, persists across
//                    pagination (ids not on the current page stay selected).
//   - selectAllMode: "select all N matching current filter" — the id list is
//                    never sent to the server for this mode; only `q` is,
//                    and the server re-runs the same filter itself. We never
//                    materialize all N ids on the client.
//
// Bug fixed 2026-09-15: BaseTable's checkboxes only ever know about the
// current page's rows. While selectAllMode is true, `effectiveSelectedKeys`
// is deliberately the current page's ids (see below) purely so the table
// renders every visible row as checked — it is NOT the real selection. Before
// this fix, unchecking a single row fed that page-scoped array back through
// `update:selectedKeys`, and `handleSelectionChange` adopted it as the new
// *entire* selection — silently shrinking "all N matching" down to "this
// page minus one" with no warning. Fix: BaseTable's checkboxes are rendered
// disabled while selectAllMode is true (`selection-disabled` prop below), so
// they cannot be toggled at all. To select a different, smaller set, the
// admin must first "Clear selection" (exits selectAllMode) and then check
// rows manually.
const selectedIds = ref(new Set())
const selectAllMode = ref(false)
const showComposeModal = ref(false)
const mailResult = ref(null)

onMounted(() => fetchUsers())
onUnmounted(() => clearTimeout(debounceTimer))

watch(q, (value) => {
  clearTimeout(debounceTimer)
  // A new search invalidates any in-flight selection semantics tied to the
  // previous filter — clear it rather than risk "select all matching" later
  // being sent with a query that no longer matches what the admin sees.
  selectedIds.value = new Set()
  selectAllMode.value = false
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

const effectiveSelectedKeys = computed(() =>
  selectAllMode.value ? users.value.map((u) => u.id) : [...selectedIds.value]
)

const selectedCount = computed(() =>
  selectAllMode.value ? usersTotalCount.value : selectedIds.value.size
)

function handleSelectionChange(keys) {
  // Any manual checkbox change exits "select all matching" mode — the
  // emitted keys become the new explicit selection.
  selectAllMode.value = false
  selectedIds.value = new Set(keys)
}

function handleSelectAllMatching() {
  selectAllMode.value = true
}

function handleClearSelection() {
  selectAllMode.value = false
  selectedIds.value = new Set()
}

function openComposeModal() {
  mailResult.value = null
  mailError.value = null
  showComposeModal.value = true
}

function closeComposeModal() {
  if (mailLoading.value) return
  showComposeModal.value = false
}

async function handleComposeSend({ subject, html }) {
  const payload = selectAllMode.value
    ? { selectAll: true, q: currentQuery.value, subject, html }
    : { userIds: [...selectedIds.value], subject, html }
  const result = await sendMail(payload)
  mailResult.value = result
  if (result) {
    selectAllMode.value = false
    selectedIds.value = new Set()
  }
}

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

    <AdminSelectionToolbar
      :selected-count="selectedCount"
      :total-count="usersTotalCount"
      @select-all-matching="handleSelectAllMatching"
      @clear="handleClearSelection"
      @send-email="openComposeModal"
    />

    <BaseTable
      :columns="columns"
      :rows="users"
      :loading="loading"
      :empty-message="t('admin.users.emptyDesc')"
      selectable
      :selected-keys="effectiveSelectedKeys"
      :selection-disabled="selectAllMode"
      @update:selected-keys="handleSelectionChange"
      @row-click="openUser"
    >
      <template #empty>
        <p class="font-medium text-[var(--text-primary)]">{{ t('admin.users.emptyTitle') }}</p>
        <p class="text-[var(--text-tertiary)] mt-1">{{ t('admin.users.emptyDesc') }}</p>
      </template>
      <template #cell-email="{ row }">
        <span>{{ row.email }}</span>
        <BaseBadge v-if="row.mailOptOut" variant="warning" size="sm" class="ml-2">
          {{ t('admin.users.optedOut') }}
        </BaseBadge>
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

    <AdminMailComposeModal
      :open="showComposeModal"
      :recipient-count="selectedCount"
      :loading="mailLoading"
      :result="mailResult"
      :error="mailError"
      @send="handleComposeSend"
      @close="closeComposeModal"
    />
  </div>
</template>
