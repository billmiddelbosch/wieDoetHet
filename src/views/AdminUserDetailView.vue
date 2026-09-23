<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAdminUsers } from '@/composables/useAdminUsers'
import { useAdminStore } from '@/stores/admin'
import { useHead } from '@/composables/useHead'
import { formatDate } from '@/utils'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'
import ConfirmModal from '@/components/molecules/ConfirmModal.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const adminStore = useAdminStore()

useHead({
  title: t('seo.adminUserDetail.title'),
  noindex: true,
})

const { currentUser, loading, error, fetchUser, setMailOptOut } = useAdminUsers()

const optOutBusy = ref(false)
const optOutFailed = ref(false)
const showResubscribe = ref(false)

onMounted(() => fetchUser(route.params.id))
onUnmounted(() => adminStore.setCurrentUser(null))
watch(() => route.params.id, (id) => { if (id) fetchUser(id) })

const groupColumns = computed(() => [
  { key: 'name', label: t('admin.groups.columnName') },
  { key: 'shareToken', label: t('groups.share') },
  { key: 'createdAt', label: t('admin.groups.columnCreatedAt') },
])

watch(() => currentUser.value?.id, () => {
  optOutFailed.value = false
})

async function applyOptOut(optOut) {
  optOutFailed.value = false
  optOutBusy.value = true
  const ok = await setMailOptOut(currentUser.value.id, optOut)
  optOutBusy.value = false
  optOutFailed.value = !ok
}

// Opting out is what the user asked for, so it goes through immediately.
// Opting back in re-enables mail, so it needs an explicit confirmation.
function handleOptOutToggle(optOut) {
  if (optOut) applyOptOut(true)
  else showResubscribe.value = true
}

async function confirmResubscribe() {
  await applyOptOut(false)
  showResubscribe.value = false
}

function openGroup(group) {
  router.push(`/admin/groups/${group.id}`)
}

function shareUrl(shareToken) {
  return `${window.location.origin}/g/${shareToken}`
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 sm:px-6 py-8">
    <button
      type="button"
      class="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4"
      @click="router.push('/admin/users')"
    >
      &larr; {{ t('admin.userDetail.back') }}
    </button>

    <div v-if="loading" class="flex justify-center py-20">
      <BaseSpinner size="lg" />
    </div>

    <div v-else-if="error" class="py-6">
      <BaseAlert variant="danger">{{ t('admin.userDetail.notFound') }}</BaseAlert>
    </div>

    <template v-else-if="currentUser">
      <BaseCard padding="md" class="mb-6">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h1 class="text-xl font-bold text-[var(--text-primary)]">{{ currentUser.name }}</h1>
            <p class="text-sm text-[var(--text-secondary)]">{{ currentUser.email }}</p>
          </div>
          <BaseBadge :variant="currentUser.role === 'admin' ? 'brand' : 'neutral'">
            {{ t(`admin.roles.${currentUser.role}`) }}
          </BaseBadge>
        </div>
        <dl class="grid grid-cols-2 gap-4 mt-5 text-sm">
          <div>
            <dt class="text-[var(--text-tertiary)]">{{ t('admin.users.columnCreatedAt') }}</dt>
            <dd class="text-[var(--text-primary)] font-medium mt-0.5">{{ formatDate(currentUser.createdAt) }}</dd>
          </div>
          <div>
            <dt class="text-[var(--text-tertiary)]">{{ t('admin.users.columnLastActivity') }}</dt>
            <dd class="text-[var(--text-primary)] font-medium mt-0.5">
              {{ formatDate(currentUser.lastActivityAt) }}
            </dd>
          </div>
        </dl>
      </BaseCard>

      <BaseCard padding="md" class="mb-6">
        <div class="flex items-center justify-between gap-3 mb-3">
          <h2 class="font-semibold text-[var(--text-primary)]">{{ t('admin.userDetail.mailPrefsTitle') }}</h2>
          <RouterLink
            :to="{ name: 'admin-mail-log', query: { q: currentUser.email } }"
            class="text-sm font-medium text-brand-500 hover:underline whitespace-nowrap"
          >
            {{ t('admin.userDetail.viewMailLog') }} &rarr;
          </RouterLink>
        </div>
        <BaseAlert v-if="optOutFailed" variant="danger" class="mb-3">
          {{ t('admin.userDetail.optOutError') }}
        </BaseAlert>
        <BaseToggle
          :model-value="currentUser.mailOptOut === true"
          :label="t('admin.userDetail.optOutLabel')"
          :description="t('admin.userDetail.optOutDescription')"
          :disabled="optOutBusy"
          @update:model-value="handleOptOutToggle"
        />
        <p class="mt-3 text-sm text-[var(--text-tertiary)]">
          {{
            currentUser.mailOptOut
              ? t('admin.userDetail.mailPrefsOptedOut', { date: formatDate(currentUser.mailOptOutAt) })
              : t('admin.userDetail.mailPrefsSubscribed')
          }}
        </p>
      </BaseCard>

      <ConfirmModal
        :open="showResubscribe"
        :title="t('admin.userDetail.resubscribeTitle')"
        :message="t('admin.userDetail.resubscribeMessage')"
        :confirm-label="t('admin.userDetail.resubscribeConfirm')"
        variant="primary"
        :loading="optOutBusy"
        @confirm="confirmResubscribe"
        @close="showResubscribe = false"
      />

      <h2 class="font-semibold text-[var(--text-primary)] mb-3">{{ t('admin.userDetail.groupsTitle') }}</h2>
      <BaseTable
        :columns="groupColumns"
        :rows="currentUser.groups"
        :empty-message="t('admin.groups.emptyDesc')"
        @row-click="openGroup"
      >
        <template #cell-shareToken="{ row }">
          {{ shareUrl(row.shareToken) }}
        </template>
        <template #cell-createdAt="{ value }">{{ formatDate(value) }}</template>
      </BaseTable>
    </template>
  </div>
</template>
