<script setup>
import { ref } from 'vue'

defineProps({
  variant: {
    type: String,
    default: 'info',
    validator: (v) => ['info', 'success', 'warning', 'danger'].includes(v),
  },
  dismissible: { type: Boolean, default: false },
  title: { type: String, default: '' },
})

const emit = defineEmits(['dismiss'])
const visible = ref(true)

function dismiss() {
  visible.value = false
  emit('dismiss')
}
</script>

<template>
  <Transition name="fade">
    <div
      v-if="visible"
      role="alert"
      :class="[
        'rounded-xl px-4 py-3 text-sm flex gap-3 items-start',
        variant === 'info' && 'bg-brand-50 text-brand-800 border border-brand-200',
        variant === 'success' && 'bg-success-50 text-success-700 border border-success-100',
        variant === 'warning' && 'bg-warning-50 text-warning-600 border border-warning-100',
        variant === 'danger' && 'bg-danger-50 text-danger-700 border border-danger-100',
      ]"
    >
      <div class="flex-1">
        <p v-if="title" class="font-semibold mb-0.5">{{ title }}</p>
        <slot />
      </div>
      <button
        v-if="dismissible"
        type="button"
        class="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
        @click="dismiss"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
  </Transition>
</template>
