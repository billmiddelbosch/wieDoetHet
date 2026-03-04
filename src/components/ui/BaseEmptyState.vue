<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
})
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center py-16 px-6 gap-4">
    <div class="rounded-full bg-[var(--bg-subtle)] p-5">
      <slot name="icon">
        <svg
          class="h-8 w-8 text-[var(--text-tertiary)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      </slot>
    </div>
    <div>
      <h3 class="text-base font-semibold text-[var(--text-primary)]">{{ title }}</h3>
      <p v-if="description" class="mt-1 text-sm text-[var(--text-secondary)] max-w-xs mx-auto">
        {{ description }}
      </p>
    </div>
    <div v-if="$slots.actions" class="mt-2">
      <slot name="actions" />
    </div>
  </div>
</template>
