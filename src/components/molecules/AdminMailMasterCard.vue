<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '@/utils'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'

const { t, locale } = useI18n()

const props = defineProps({
  // `master` of GET /admin/mail-templates: { enabled, updatedAt, updatedBy }.
  master: { type: Object, required: true },
  // The last run was stopped by the LIFECYCLE_MAIL_ENABLED=false override on the server.
  killSwitch: { type: Boolean, default: false },
  // A request is in flight — the toggle is locked meanwhile.
  saving: { type: Boolean, default: false },
})

defineEmits(['toggle'])

const updatedAt = computed(() =>
  props.master.updatedAt
    ? formatDateTime(props.master.updatedAt, locale.value === 'en' ? 'en-GB' : 'nl-NL')
    : ''
)
</script>

<template>
  <BaseCard as="section" class="flex flex-col gap-3" aria-labelledby="mail-master-title">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 id="mail-master-title" class="text-base font-semibold text-[var(--text-primary)]">
          {{ t('admin.automation.master.title') }}
        </h2>
        <p class="text-sm text-[var(--text-secondary)] mt-0.5">
          {{ master.enabled ? t('admin.automation.master.on') : t('admin.automation.masterOff') }}
        </p>
      </div>
      <BaseToggle
        :model-value="master.enabled"
        :label="t('admin.automation.master.label')"
        :disabled="saving"
        @update:model-value="$emit('toggle', $event)"
      />
    </div>

    <BaseAlert v-if="master.enabled && killSwitch" variant="warning">
      {{ t('admin.automation.master.killSwitch') }}
    </BaseAlert>

    <p v-if="updatedAt" class="text-xs text-[var(--text-tertiary)]">
      {{ t('admin.automation.master.updatedAt', { at: updatedAt }) }}
    </p>
  </BaseCard>
</template>
