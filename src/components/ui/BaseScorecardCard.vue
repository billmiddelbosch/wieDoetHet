<script setup>
import BaseAvatar from '@/components/ui/BaseAvatar.vue'

defineProps({
  title: { type: String, required: true },
  maxClaims: { type: Number, default: null },
  participants: {
    type: Array,
    required: true,
    // [{ name: string, claimed: boolean }]
  },
})
</script>

<template>
  <div class="bg-[var(--bg-surface)] rounded-[1rem] border border-[var(--border-default)] p-4 flex flex-col gap-3">
    <!-- Header: task title + score badge -->
    <div class="flex items-start justify-between gap-2">
      <p class="font-semibold text-[var(--text-primary)] leading-snug">{{ title }}</p>
      <span
        class="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
        :class="
          maxClaims !== null &&
          participants.filter((p) => p.claimed).length >= maxClaims &&
          participants.length > 0
            ? 'bg-success-100 text-success-700'
            : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
        "
      >
        {{ participants.filter((p) => p.claimed).length }}/{{ maxClaims ?? '∞' }}
      </span>
    </div>

    <!-- Participant list (claimants only) -->
    <ul v-if="participants.some((p) => p.claimed)" class="flex flex-col gap-1.5">
      <li
        v-for="participant in participants.filter((p) => p.claimed)"
        :key="participant.name"
        class="flex items-center gap-2.5 text-sm"
      >
        <span class="shrink-0 h-5 w-5 rounded-full bg-success-100 flex items-center justify-center">
          <svg
            class="h-3 w-3 text-success-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <BaseAvatar :name="participant.name" size="xs" />
        <span class="text-[var(--text-primary)]">{{ participant.name }}</span>
      </li>
    </ul>
    <p v-else class="text-xs text-[var(--text-tertiary)]">Nog niemand geclaimd</p>
  </div>
</template>
