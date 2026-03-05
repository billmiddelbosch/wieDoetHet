<script setup>
defineProps({
  variant: {
    type: String,
    default: 'neutral',
    validator: (v) => ['neutral', 'success', 'warning', 'danger', 'info', 'brand'].includes(v),
  },
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md'].includes(v),
  },
})
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1 rounded-full font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-xs',
      variant === 'neutral' && 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]',
      variant === 'brand' && 'bg-brand-100 text-brand-700',
      variant === 'success' && 'bg-success-100 text-success-700',
      variant === 'warning' && 'bg-warning-100 text-warning-600',
      variant === 'danger' && 'bg-danger-100 text-danger-700',
      variant === 'info' && 'bg-brand-100 text-brand-700',
    ]"
  >
    <slot />
  </span>
</template>
