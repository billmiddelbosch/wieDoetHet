<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: '' },
  description: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <label
    class="flex items-start gap-3 cursor-pointer"
    :class="disabled ? 'opacity-50 cursor-not-allowed' : ''"
  >
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :disabled="disabled"
      :class="[
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 mt-0.5',
        modelValue ? 'bg-brand-500' : 'bg-[var(--border-strong)]',
      ]"
      @click="$emit('update:modelValue', !modelValue)"
    >
      <span
        :class="[
          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200',
          modelValue ? 'translate-x-6' : 'translate-x-1',
        ]"
      />
    </button>
    <div v-if="label || description" class="flex flex-col">
      <span v-if="label" class="text-sm font-medium text-[var(--text-primary)]">{{ label }}</span>
      <span v-if="description" class="text-xs text-[var(--text-secondary)] mt-0.5">{{
        description
      }}</span>
    </div>
  </label>
</template>
