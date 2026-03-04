<script setup>
defineProps({
  size: { type: String, default: 'md', validator: (v) => ['sm', 'md', 'lg'].includes(v) },
})
</script>

<template>
  <svg
    :class="[
      'animate-spin text-brand-500',
      size === 'sm' && 'h-4 w-4',
      size === 'md' && 'h-6 w-6',
      size === 'lg' && 'h-10 w-10',
    ]"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
</template>
