<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdminMailTemplates } from '@/composables/useAdminMailTemplates'
import { useHead } from '@/composables/useHead'
import { formatDateTime } from '@/utils'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'
import AdminAutomationTabs from '@/components/molecules/AdminAutomationTabs.vue'
import AdminMailTemplateCard from '@/components/molecules/AdminMailTemplateCard.vue'
import AdminMailMasterCard from '@/components/molecules/AdminMailMasterCard.vue'
import ConfirmModal from '@/components/molecules/ConfirmModal.vue'
import AdminMailTemplateEditModal from '@/components/organisms/AdminMailTemplateEditModal.vue'

const { t, locale } = useI18n()

useHead({
  title: t('seo.adminAutomation.title'),
  noindex: true,
})

const {
  templates,
  lastRun,
  master,
  loading,
  error,
  savingIds,
  masterSaving,
  fetchTemplates,
  setEnabled,
  setMaster,
} = useAdminMailTemplates()

// The banners describe the last run, so they must not show before the first
// response is in (the store may still hold a stale value from an earlier visit).
const hasLoaded = ref(false)
const toggleFailed = ref(false)
const editingId = ref(null)
const confirmingMaster = ref(false)

const editingTemplate = computed(
  () => templates.value.find((tpl) => tpl.id === editingId.value) ?? null
)
const enabledTemplateCount = computed(() => templates.value.filter((tpl) => tpl.enabled).length)
const lastRunAt = computed(() =>
  lastRun.value ? formatDateTime(lastRun.value.at, locale.value === 'en' ? 'en-GB' : 'nl-NL') : ''
)

onMounted(async () => {
  await fetchTemplates()
  hasLoaded.value = true
})

// Switching the master on starts real mails, so it asks first; switching off is immediate.
function handleMasterToggle(enabled) {
  if (enabled) confirmingMaster.value = true
  else applyMaster(false)
}

async function applyMaster(enabled) {
  toggleFailed.value = false
  const ok = await setMaster(enabled)
  toggleFailed.value = !ok
  confirmingMaster.value = false
}

async function handleToggle(template, enabled) {
  toggleFailed.value = false
  const ok = await setEnabled(template.id, enabled)
  toggleFailed.value = !ok
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-8">
    <h1 class="text-2xl font-bold text-[var(--text-primary)] mb-6">
      {{ t('admin.automation.title') }}
    </h1>

    <AdminAutomationTabs active="templates" />

    <div v-if="loading && !hasLoaded" class="flex justify-center py-16">
      <BaseSpinner size="lg" />
    </div>

    <BaseAlert v-else-if="error" variant="danger">
      {{ t('admin.automation.loadError') }}
    </BaseAlert>

    <template v-else-if="hasLoaded">
      <BaseAlert v-if="lastRun === null" variant="warning" class="mb-4">
        {{ t('admin.automation.neverRan') }}
      </BaseAlert>
      <p v-else class="mb-4 text-sm text-[var(--text-tertiary)]">
        {{
          t('admin.automation.lastRun', {
            at: lastRunAt,
            sent: lastRun.sent,
            failed: lastRun.failed,
          })
        }}
      </p>

      <BaseAlert v-if="toggleFailed" variant="danger" class="mb-4">
        {{ t('admin.automation.toggleError') }}
      </BaseAlert>

      <AdminMailMasterCard
        class="mb-4"
        :master="master"
        :kill-switch="lastRun?.killSwitch === true"
        :saving="masterSaving"
        @toggle="handleMasterToggle"
      />

      <div class="flex flex-col gap-4">
        <AdminMailTemplateCard
          v-for="template in templates"
          :key="template.id"
          :template="template"
          :saving="savingIds.has(template.id)"
          @toggle="handleToggle(template, $event)"
          @edit="editingId = template.id"
        />
      </div>
    </template>

    <ConfirmModal
      :open="confirmingMaster"
      :title="t('admin.automation.master.confirmTitle')"
      :message="t('admin.automation.master.confirmMessage', { count: enabledTemplateCount })"
      :confirm-label="t('admin.automation.master.confirmLabel')"
      variant="primary"
      :loading="masterSaving"
      @confirm="applyMaster(true)"
      @close="confirmingMaster = false"
    />

    <AdminMailTemplateEditModal
      :open="editingId !== null"
      :template="editingTemplate"
      :saving="editingId !== null && savingIds.has(editingId)"
      @close="editingId = null"
      @saved="editingId = null"
    />
  </div>
</template>
