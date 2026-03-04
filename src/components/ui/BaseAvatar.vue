<script setup>
import { computed } from 'vue'

const props = defineProps({
  src: { type: String, default: null },
  name: { type: String, default: '' },
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['xs', 'sm', 'md', 'lg', 'xl'].includes(v),
  },
})

const initials = computed(() => {
  if (!props.name) return '?'
  return props.name
    .trim()
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
})

const sizeClasses = computed(
  () =>
    ({
      xs: 'h-6 w-6 text-xs',
      sm: 'h-8 w-8 text-sm',
      md: 'h-10 w-10 text-sm',
      lg: 'h-12 w-12 text-base',
      xl: 'h-16 w-16 text-lg',
    })[props.size]
)

// Deterministic color from name
const colorIndex = computed(() => {
  let hash = 0
  for (const ch of props.name) hash = ch.charCodeAt(0) + ((hash << 5) - hash)
  return Math.abs(hash) % 6
})

const bgColors = [
  'bg-brand-500',
  'bg-success-500',
  'bg-warning-500',
  'bg-danger-500',
  'bg-purple-500',
  'bg-pink-500',
]
</script>

<template>
  <div
    :class="[
      'rounded-full flex items-center justify-center shrink-0 overflow-hidden',
      sizeClasses,
      !src ? bgColors[colorIndex] : '',
    ]"
  >
    <img v-if="src" :src="src" :alt="name" class="h-full w-full object-cover" />
    <span v-else class="font-semibold text-white leading-none">{{ initials }}</span>
  </div>
</template>
