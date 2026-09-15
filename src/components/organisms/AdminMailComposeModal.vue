<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseRichTextEditor from '@/components/ui/BaseRichTextEditor.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'

const { t } = useI18n()

const props = defineProps({
  open: { type: Boolean, required: true },
  recipientCount: { type: Number, required: true },
  loading: { type: Boolean, default: false },
  // Aggregate result of the last send attempt: { sent, failed, failures } | null.
  // Rendered as a summary inside the modal so the admin sees per-recipient
  // outcomes without leaving the compose flow.
  result: { type: Object, default: null },
  error: { type: String, default: null },
})

const emit = defineEmits(['send', 'close'])

const subject = ref('')
const html = ref('')
const errors = ref({})

watch(
  () => props.open,
  (val) => {
    if (val) {
      subject.value = ''
      html.value = ''
      errors.value = {}
    }
  }
)

function validate() {
  errors.value = {}
  if (!subject.value.trim()) errors.value.subject = t('admin.mail.subjectRequired')
  const isEmptyHtml = !html.value.trim() || html.value.trim() === '<p></p>'
  if (isEmptyHtml) errors.value.html = t('admin.mail.bodyRequired')
  return Object.keys(errors.value).length === 0
}

function submit() {
  if (!validate()) return
  emit('send', { subject: subject.value.trim(), html: html.value })
}
</script>

<template>
  <BaseModal :open="open" :title="t('admin.mail.composeTitle')" size="lg" @close="$emit('close')">
    <div class="flex flex-col gap-5">
      <p class="text-sm text-[var(--text-secondary)]">
        {{ t('admin.mail.recipientSummary', { count: recipientCount }) }}
      </p>

      <BaseAlert v-if="error" variant="danger">{{ error }}</BaseAlert>

      <BaseAlert v-else-if="result" :variant="result.failed > 0 ? 'warning' : 'success'">
        <p>{{ t('admin.mail.resultSummary', { sent: result.sent, failed: result.failed }) }}</p>
        <ul v-if="result.failures?.length" class="mt-2 list-disc pl-5 text-xs">
          <li v-for="f in result.failures" :key="f.userId">{{ f.email }} — {{ f.message }}</li>
        </ul>
      </BaseAlert>

      <BaseInput
        id="mail-subject"
        v-model="subject"
        :label="t('admin.mail.subjectLabel')"
        :placeholder="t('admin.mail.subjectPlaceholder')"
        :error="errors.subject"
        :disabled="loading"
        required
      />
      <BaseRichTextEditor
        id="mail-body"
        v-model="html"
        :label="t('admin.mail.bodyLabel')"
        :placeholder="t('admin.mail.bodyPlaceholder')"
        :error="errors.html"
        :disabled="loading"
        required
      />
    </div>
    <template #footer>
      <div class="flex gap-3 justify-end">
        <BaseButton variant="ghost" :disabled="loading" @click="$emit('close')">
          {{ t('common.cancel') }}
        </BaseButton>
        <BaseButton variant="primary" :loading="loading" @click="submit">
          {{ t('admin.mail.sendCta') }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>
