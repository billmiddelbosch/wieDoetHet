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
import AdminMailTemplateEditModal from '@/components/organisms/AdminMailTemplateEditModal.vue'

const { t, locale } = useI18n()

useHead({
  title: t('seo.adminAutomation.title'),
  noindex: true,
})

const { templates, lastRun, loading, error, savingIds, fetchTemplates, setEnabled } =
  useAdminMailTemplates()

// The banners describe the last run, so they must not show before the first
// response is in (the store may still hold a stale value from an earlier visit).
const hasLoaded = ref(false)
const toggleFailed = ref(false)
const editingId = ref(null)

const editingTemplate = computed(
  () => templates.value.find((tpl) => tpl.id === editingId.value) ?? null
)
const lastRunAt = computed(() =>
  lastRun.value ? formatDateTime(lastRun.value.at, locale.value === 'en' ? 'en-GB' : 'nl-NL') : ''
)

onMounted(async () => {
  await fetchTemplates()
  hasLoaded.value = true
})

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
      <BaseAlert v-else-if="lastRun.masterEnabled === false" variant="warning" class="mb-4">
        {{ t('admin.automation.masterOff') }}
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

    <AdminMailTemplateEditModal
      :open="editingId !== null"
      :template="editingTemplate"
      :saving="editingId !== null && savingIds.has(editingId)"
      @close="editingId = null"
      @saved="editingId = null"
    />
  </div>
</template>
