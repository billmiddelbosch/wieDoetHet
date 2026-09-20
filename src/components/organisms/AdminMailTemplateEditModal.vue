<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdminMailTemplates } from '@/composables/useAdminMailTemplates'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseRichTextEditor from '@/components/ui/BaseRichTextEditor.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'

const { t } = useI18n()

const props = defineProps({
  open: { type: Boolean, required: true },
  // The template being edited (an entry of GET /admin/mail-templates) or null.
  template: { type: Object, default: null },
  // A request for this template is already in flight elsewhere on the page.
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'saved'])

// The modal talks to the API itself; the template list it updates lives in the
// admin store, so the page behind it refreshes without any wiring.
const { saveTemplate, resetTemplate, sendTest, savingIds } = useAdminMailTemplates()

const subject = ref('')
const bodyHtml = ref('')
const errors = ref({})
const serverError = ref(null)
const testResult = ref(null)
// Which footer button started the request in flight, so only that one spins.
const pendingAction = ref(null)

const busy = computed(
  () => props.saving || (props.template ? savingIds.value.has(props.template.id) : false)
)

// Shown as {{firstName}} etc. Display-only: they tell the admin which fields
// the server will accept for this template.
const variableTokens = computed(() =>
  (props.template?.variables ?? []).map((name) => `{{${name}}}`)
)

function loadFromTemplate() {
  subject.value = props.template?.subject ?? ''
  bodyHtml.value = props.template?.bodyHtml ?? ''
}

// Pre-fill with the effective text every time the modal opens.
watch(
  () => [props.open, props.template?.id],
  ([isOpen]) => {
    if (!isOpen) return
    loadFromTemplate()
    errors.value = {}
    serverError.value = null
    testResult.value = null
  },
  { immediate: true }
)

function validate() {
  errors.value = {}
  if (!subject.value.trim()) errors.value.subject = t('admin.automation.editModal.subjectRequired')
  const body = bodyHtml.value.trim()
  if (!body || body === '<p></p>')
    errors.value.bodyHtml = t('admin.automation.editModal.bodyRequired')
  return Object.keys(errors.value).length === 0
}

async function save() {
  serverError.value = null
  testResult.value = null
  if (!validate()) return
  pendingAction.value = 'save'
  const result = await saveTemplate(props.template.id, {
    subject: subject.value.trim(),
    bodyHtml: bodyHtml.value,
  })
  pendingAction.value = null
  if (result.ok) emit('saved')
  else serverError.value = result.message ?? t('admin.automation.editModal.saveError')
}

async function reset() {
  serverError.value = null
  testResult.value = null
  errors.value = {}
  pendingAction.value = 'reset'
  const result = await resetTemplate(props.template.id)
  pendingAction.value = null
  if (result.ok) loadFromTemplate()
  else serverError.value = result.message ?? t('admin.automation.editModal.saveError')
}

async function sendTestMail() {
  serverError.value = null
  testResult.value = null
  pendingAction.value = 'test'
  const result = await sendTest(props.template.id)
  pendingAction.value = null
  if (result.ok) testResult.value = t('admin.automation.editModal.testSent', { email: result.to })
  else serverError.value = result.message
}
</script>

<template>
  <BaseModal
    :open="open"
    :title="t('admin.automation.editModal.title')"
    size="lg"
    @close="$emit('close')"
  >
    <div v-if="template" class="flex flex-col gap-5">
      <p class="text-sm font-medium text-[var(--text-secondary)]">
        {{ t(`admin.automation.templates.${template.id}.name`) }}
      </p>

      <BaseInput
        id="template-subject"
        v-model="subject"
        :label="t('admin.automation.editModal.subject')"
        :error="errors.subject"
        :disabled="busy"
        required
      />
      <BaseRichTextEditor
        id="template-body"
        v-model="bodyHtml"
        :label="t('admin.automation.editModal.body')"
        :error="errors.bodyHtml"
        :disabled="busy"
        required
      />

      <div class="flex flex-col gap-2">
        <p class="text-xs font-medium text-[var(--text-secondary)]">
          {{ t('admin.automation.editModal.variables') }}
        </p>
        <ul class="flex flex-wrap gap-2">
          <li
            v-for="token in variableTokens"
            :key="token"
            class="rounded-md bg-[var(--bg-subtle)] px-2 py-1 font-mono text-xs text-[var(--text-primary)]"
          >
            {{ token }}
          </li>
        </ul>
        <p class="text-xs text-[var(--text-tertiary)]">
          {{ t('admin.automation.editModal.footerNote') }}
        </p>
      </div>
    </div>

    <template #footer>
      <!-- In the footer, not the body: the body scrolls, so a message up there would be out of sight. -->
      <BaseAlert v-if="serverError" variant="danger" class="mb-3">{{ serverError }}</BaseAlert>
      <BaseAlert v-else-if="testResult" variant="success" class="mb-3">{{ testResult }}</BaseAlert>
      <div class="flex flex-wrap gap-3 justify-between">
        <div class="flex flex-wrap gap-3">
          <BaseButton
            variant="secondary"
            :loading="pendingAction === 'reset'"
            :disabled="busy || !template?.isCustomised"
            @click="reset"
          >
            {{ t('admin.automation.editModal.reset') }}
          </BaseButton>
          <BaseButton
            variant="secondary"
            :loading="pendingAction === 'test'"
            :disabled="busy"
            @click="sendTestMail"
          >
            {{ t('admin.automation.editModal.test') }}
          </BaseButton>
        </div>
        <div class="flex gap-3">
          <BaseButton variant="ghost" :disabled="busy" @click="$emit('close')">
            {{ t('common.cancel') }}
          </BaseButton>
          <BaseButton
            variant="primary"
            :loading="pendingAction === 'save'"
            :disabled="busy"
            @click="save"
          >
            {{ t('admin.automation.editModal.save') }}
          </BaseButton>
        </div>
      </div>
    </template>
  </BaseModal>
</template>
