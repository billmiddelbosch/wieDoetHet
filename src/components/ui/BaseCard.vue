<script setup>
defineProps({
  hoverable: { type: Boolean, default: false },
  padding: {
    type: String,
    default: 'md',
    validator: (v) => ['none', 'sm', 'md', 'lg'].includes(v),
  },
  as: { type: String, default: 'div' },
})
</script>

<template>
  <component
    :is="as"
    :class="[
      'rounded-[1rem] border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-sm',
      hoverable &&
        'cursor-pointer transition-all duration-150 hover:shadow-md hover:border-brand-300 hover:-translate-y-0.5',
      padding === 'none' && 'p-0',
      padding === 'sm' && 'p-4',
      padding === 'md' && 'p-6',
      padding === 'lg' && 'p-8',
    ]"
  >
    <slot />
  </component>
</template>
