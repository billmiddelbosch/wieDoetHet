<script setup>
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const { t } = useI18n()

defineProps({
  open: { type: Boolean, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  confirmLabel: { type: String, default: null },
  variant: { type: String, default: 'danger' },
  loading: { type: Boolean, default: false },
})

defineEmits(['confirm', 'close'])
</script>

<template>
  <BaseModal :open="open" :title="title" size="sm" @close="$emit('close')">
    <p class="text-sm text-[var(--text-secondary)]">{{ message }}</p>
    <template #footer>
      <div class="flex gap-3 justify-end">
        <BaseButton variant="ghost" :disabled="loading" @click="$emit('close')">
          {{ t('common.cancel') }}
        </BaseButton>
        <BaseButton :variant="variant" :loading="loading" @click="$emit('confirm')">
          {{ confirmLabel || t('common.confirm') }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>
