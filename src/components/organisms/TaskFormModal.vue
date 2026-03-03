<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'

const { t } = useI18n()

const props = defineProps({
  open: { type: Boolean, required: true },
  task: { type: Object, default: null }, // null = create mode
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'close'])

const title = ref('')
const description = ref('')
const hasCapacity = ref(false)
const maxCapacity = ref(2)
const errors = ref({})

watch(
  () => props.open,
  (val) => {
    if (val) {
      title.value = props.task?.title ?? ''
      description.value = props.task?.description ?? ''
      hasCapacity.value = props.task?.maxCapacity != null
      maxCapacity.value = props.task?.maxCapacity ?? 2
      errors.value = {}
    }
  }
)

function validate() {
  errors.value = {}
  if (!title.value.trim()) errors.value.title = t('tasks.titleRequired')
  if (hasCapacity.value && (!maxCapacity.value || maxCapacity.value < 1))
    errors.value.maxCapacity = t('tasks.capacityMin')
  return Object.keys(errors.value).length === 0
}

function submit() {
  if (!validate()) return
  emit('save', {
    title: title.value.trim(),
    description: description.value.trim() || null,
    maxCapacity: hasCapacity.value ? Number(maxCapacity.value) : null,
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
        v-model="maxCapacity"
        type="number"
        :label="t('tasks.maxCapacityLabel')"
        :error="errors.maxCapacity"
        :hint="t('tasks.maxCapacityHint')"
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
