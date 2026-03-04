<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  type: { type: String, default: 'text' },
  error: { type: String, default: null },
  disabled: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  hint: { type: String, default: '' },
  id: { type: String, default: null },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" :for="id" class="text-sm font-medium text-[var(--text-primary)]">
      {{ label }}
      <span v-if="required" class="text-danger-500 ml-0.5">*</span>
    </label>
    <input
      :id="id"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :class="[
        'w-full px-4 py-2.5 rounded-[0.625rem] border text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-colors duration-150',
        'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
        error
          ? 'border-danger-500 bg-danger-50 dark:bg-danger-950'
          : 'border-[var(--border-default)] hover:border-[var(--border-strong)]',
        disabled ? 'opacity-50 cursor-not-allowed bg-[var(--bg-subtle)]' : '',
      ]"
      @input="$emit('update:modelValue', $event.target.value)"
    />
    <p v-if="error" class="text-xs text-danger-600 font-medium">{{ error }}</p>
    <p v-else-if="hint" class="text-xs text-[var(--text-tertiary)]">{{ hint }}</p>
  </div>
</template>
