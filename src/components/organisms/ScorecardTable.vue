<script setup>
import BaseAvatar from '@/components/ui/BaseAvatar.vue'

defineProps({
  rows: { type: Array, required: true }, // ScorecardRow[]
  tasks: { type: Array, required: true }, // Task[]
})
</script>

<template>
  <div class="overflow-x-auto rounded-[1rem] border border-[var(--border-default)]">
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-[var(--bg-subtle)] border-b border-[var(--border-default)]">
          <th
            class="text-left px-4 py-3 font-semibold text-[var(--text-secondary)] min-w-[150px] sticky left-0 bg-[var(--bg-subtle)]"
          >
            Deelnemer
          </th>
          <th
            v-for="task in tasks"
            :key="task.id"
            class="px-4 py-3 font-semibold text-[var(--text-secondary)] text-center min-w-[120px]"
          >
            <span class="block truncate max-w-[120px]" :title="task.title">{{ task.title }}</span>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[var(--border-default)]">
        <tr
          v-for="row in rows"
          :key="row.participantId ?? row.participantName"
          class="bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] transition-colors"
        >
          <td class="px-4 py-3 sticky left-0 bg-[var(--bg-surface)]">
            <div class="flex items-center gap-2">
              <BaseAvatar :name="row.participantName" size="xs" />
              <span class="font-medium text-[var(--text-primary)] truncate">{{
                row.participantName
              }}</span>
            </div>
          </td>
          <td v-for="task in tasks" :key="task.id" class="px-4 py-3 text-center">
            <span
              v-if="row.tasks.some((t) => t.taskId === task.id)"
              class="inline-flex items-center justify-center h-6 w-6 rounded-full bg-success-100 text-success-700 mx-auto"
            >
              <svg
                class="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <span v-else class="text-[var(--text-tertiary)]">&mdash;</span>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Empty rows -->
    <div v-if="rows.length === 0" class="py-12 text-center text-sm text-[var(--text-secondary)]">
      Nog niemand heeft taken geclaimd.
    </div>
  </div>
</template>
