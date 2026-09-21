<script setup>
import { useI18n } from 'vue-i18n'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const { t } = useI18n()

defineProps({
  // One entry of GET /admin/mail-templates.
  template: { type: Object, required: true },
  // A request for this template is in flight — the toggle is locked meanwhile.
  saving: { type: Boolean, default: false },
})

defineEmits(['toggle', 'edit'])
</script>

<template>
  <BaseCard as="article" class="flex flex-col gap-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-base font-semibold text-[var(--text-primary)]">
          {{ t(`admin.automation.templates.${template.id}.name`) }}
        </h3>
        <p class="text-sm text-[var(--text-secondary)] mt-0.5">
          {{ t(`admin.automation.templates.${template.id}.description`) }}
        </p>
      </div>
      <BaseToggle
        :model-value="template.enabled"
        :label="t('admin.automation.enabled')"
        :disabled="saving"
        @update:model-value="$emit('toggle', $event)"
      />
    </div>

    <p class="text-sm text-[var(--text-tertiary)]">
      {{ t(`admin.automation.templates.${template.id}.trigger`) }}
    </p>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <BaseBadge variant="info" size="sm">{{
          t(`admin.automation.timing.${template.tier}`)
        }}</BaseBadge>
        <BaseBadge :variant="template.isCustomised ? 'brand' : 'neutral'" size="sm">
          {{
            template.isCustomised ? t('admin.automation.customised') : t('admin.automation.default')
          }}
        </BaseBadge>
      </div>
      <BaseButton variant="secondary" size="sm" @click="$emit('edit')">
        {{ t('admin.automation.edit') }}
      </BaseButton>
    </div>
  </BaseCard>
</template>
