<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'
import ReminderSection from '@/components/molecules/ReminderSection.vue'

const { t } = useI18n()

const props = defineProps({
  open: { type: Boolean, required: true },
  task: { type: Object, default: null }, // null = create mode
  loading: { type: Boolean, default: false },
  /** groupId — required for task-scoped reminder ownership verification */
  groupId: { type: String, default: null },
  /** Whether the initiator has an active Web Push subscription */
  hasPushSubscription: { type: Boolean, default: false },
  /** Whether the initiator has a phone number on their profile */
  hasPhoneNumber: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'close', 'push-subscribed'])

const title = ref('')
const description = ref('')
const hasCapacity = ref(false)
const maxClaims = ref(2)
const errors = ref({})
const taskReminder = ref(null)
// In create mode, store the chosen scheduledAt to pass along with the save payload
const pendingReminderAt = ref(null)

const isCreateMode = computed(() => !props.task?.id)

watch(
  () => props.open,
  (val) => {
    if (val) {
      title.value = props.task?.title ?? ''
      description.value = props.task?.description ?? ''
      hasCapacity.value = !!props.task?.maxClaims
      maxClaims.value = props.task?.maxClaims ?? 2
      errors.value = {}
      taskReminder.value = props.task?.reminder ?? null
      pendingReminderAt.value = null
    }
  }
)

function validate() {
  errors.value = {}
  if (!title.value.trim()) errors.value.title = t('tasks.titleRequired')
  if (hasCapacity.value && (!maxClaims.value || maxClaims.value < 1))
    errors.value.maxClaims = t('tasks.capacityMin')
  return Object.keys(errors.value).length === 0
}

function submit() {
  if (!validate()) return
  emit('save', {
    title: title.value.trim(),
    description: description.value.trim() || null,
    maxClaims: hasCapacity.value ? Number(maxClaims.value) : null,
    pendingReminderAt: pendingReminderAt.value,
  })
}
</script>

<template>
  <BaseModal
    :open="open"
    :title="task ? t('tasks.editTask') : t('tasks.addTask')"
    size="md"
    @close="$emit('close')"
  >
    <div class="flex flex-col gap-5">
      <BaseInput
        id="task-title"
        v-model="title"
        :label="t('tasks.titleLabel')"
        :placeholder="t('tasks.titlePlaceholder')"
        :error="errors.title"
        required
      />
      <BaseTextarea
        id="task-description"
        v-model="description"
        :label="t('tasks.descriptionLabel')"
        :placeholder="t('tasks.descriptionPlaceholder')"
        :rows="3"
      />
      <BaseToggle
        v-model="hasCapacity"
        :label="t('tasks.limitCapacity')"
        :description="t('tasks.limitCapacityHint')"
      />
      <BaseInput
        v-if="hasCapacity"
        id="task-capacity"
        v-model="maxClaims"
        type="number"
        :label="t('tasks.maxCapacityLabel')"
        :error="errors.maxClaims"
        :hint="t('tasks.maxCapacityHint')"
      />

      <!-- Reminder — always visible; deferred in create mode (no taskId yet) -->
      <ReminderSection
        :id="task?.id ?? ''"
        scope="task"
        :group-id="groupId"
        :has-push-subscription="hasPushSubscription"
        :has-phone-number="hasPhoneNumber"
        :existing-reminder="taskReminder"
        :deferred="isCreateMode"
        @scheduled="(at) => isCreateMode ? (pendingReminderAt = at) : (taskReminder = { scheduledAt: at, status: 'scheduled' })"
        @cancelled="taskReminder = null"
        @push-subscribed="$emit('push-subscribed')"
      />
    </div>
    <template #footer>
      <div class="flex gap-3 justify-end">
        <BaseButton variant="ghost" :disabled="loading" @click="$emit('close')">
          {{ t('common.cancel') }}
        </BaseButton>
        <BaseButton variant="primary" :loading="loading" @click="submit">
          {{ task ? t('common.save') : t('tasks.addTask') }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>
