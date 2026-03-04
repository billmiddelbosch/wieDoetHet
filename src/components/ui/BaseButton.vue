<script setup>
defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (v) => ['primary', 'secondary', 'danger', 'ghost', 'whatsapp'].includes(v),
  },
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md', 'lg'].includes(v),
  },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  type: { type: String, default: 'button' },
  full: { type: Boolean, default: false },
})

defineEmits(['click'])
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 select-none',
      full ? 'w-full' : '',
      size === 'sm' && 'px-4 py-1.5 text-sm',
      size === 'md' && 'px-5 py-2.5 text-sm',
      size === 'lg' && 'px-7 py-3 text-base',
      variant === 'primary' &&
        'bg-brand-500 text-white hover:bg-brand-600 focus-visible:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed',
      variant === 'secondary' &&
        'bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] focus-visible:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed',
      variant === 'danger' &&
        'bg-danger-600 text-white hover:bg-danger-700 focus-visible:ring-danger-500 disabled:opacity-50 disabled:cursor-not-allowed',
      variant === 'ghost' &&
        'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed',
      variant === 'whatsapp' &&
        'bg-whatsapp text-white hover:bg-whatsapp-dark focus-visible:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed',
    ]"
    @click="$emit('click', $event)"
  >
    <svg
      v-if="loading"
      class="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
    <slot />
  </button>
</template>
