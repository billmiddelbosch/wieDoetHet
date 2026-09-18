<script setup>
import { useI18n } from 'vue-i18n'
import BaseButton from '@/components/ui/BaseButton.vue'

const { t } = useI18n()

defineProps({
  selectedCount: { type: Number, required: true },
  totalCount: { type: Number, required: true },
  disabled: { type: Boolean, default: false },
})

defineEmits(['select-all-matching', 'clear', 'send-email'])
</script>

<template>
  <div
    v-if="selectedCount > 0"
    class="flex flex-wrap items-center gap-3 rounded-[0.875rem] border border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-3 mb-4"
  >
    <span class="text-sm font-medium text-[var(--text-primary)]">
      {{ t('admin.mail.selectedCount', { count: selectedCount }) }}
    </span>

    <button
      v-if="selectedCount < totalCount"
      type="button"
      class="text-sm font-medium text-brand-600 hover:text-brand-700 underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      :disabled="disabled"
      @click="$emit('select-all-matching')"
    >
      {{ t('admin.mail.selectAllMatching', { count: totalCount }) }}
    </button>

    <div class="flex-1"></div>

    <BaseButton variant="ghost" size="sm" :disabled="disabled" @click="$emit('clear')">
      {{ t('admin.mail.clearSelection') }}
    </BaseButton>
    <BaseButton variant="primary" size="sm" :disabled="disabled" @click="$emit('send-email')">
      {{ t('admin.mail.sendEmail') }}
    </BaseButton>
  </div>
</template>
