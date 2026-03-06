<script setup>
import { computed } from 'vue'
import BaseScorecardCard from '@/components/ui/BaseScorecardCard.vue'

const props = defineProps({
  rows: { type: Array, required: true }, // ScorecardRow[]
  tasks: { type: Array, required: true }, // Task[]
})

const taskCards = computed(() =>
  props.tasks.map((task) => ({
    task,
    participants: props.rows.map((row) => ({
      name: row.participantName,
      claimed: row.tasks.some((t) => t.taskId === task.id),
    })),
  })),
)
</script>

<template>
  <div
    v-if="rows.length === 0"
    class="py-12 text-center text-sm text-[var(--text-secondary)]"
  >
    Nog niemand heeft taken geclaimd.
  </div>

  <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <BaseScorecardCard
      v-for="{ task, participants } in taskCards"
      :key="task.id"
      :title="task.title"
      :max-claims="task.maxClaims ?? null"
      :participants="participants"
    />
  </div>
</template>
