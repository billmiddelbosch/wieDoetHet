<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const { t } = useI18n()

defineProps({
  open: { type: Boolean, required: true },
})

const emit = defineEmits(['submit', 'close'])

const name = ref('')
const error = ref('')

function submit() {
  if (!name.value.trim()) {
    error.value = t('anon.nameRequired')
    return
  }
  emit('submit', name.value.trim())
  name.value = ''
  error.value = ''
}
</script>

<template>
  <BaseModal :open="open" :title="t('anon.title')" size="sm" @close="$emit('close')">
    <div class="flex flex-col gap-4">
      <p class="text-sm text-[var(--text-secondary)]">{{ t('anon.description') }}</p>
      <BaseInput
        v-model="name"
        :label="t('anon.nameLabel')"
        :placeholder="t('anon.namePlaceholder')"
        :error="error"
        required
        @keydown.enter="submit"
      />
    </div>
    <template #footer>
      <div class="flex gap-3 justify-end">
        <BaseButton variant="ghost" @click="$emit('close')">{{ t('common.cancel') }}</BaseButton>
        <BaseButton variant="primary" @click="submit">{{ t('anon.continue') }}</BaseButton>
      </div>
    </template>
  </BaseModal>
</template>
