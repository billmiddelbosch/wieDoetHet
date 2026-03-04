<script setup>
import { computed } from 'vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'

const props = defineProps({
  task: { type: Object, required: true },
  isInitiator: { type: Boolean, default: false },
  claimLoading: { type: Boolean, default: false },
})

defineEmits(['claim', 'unclaim', 'edit', 'delete'])

const isFull = computed(() => props.task.isFull)

const statusVariant = computed(() => {
  if (props.task.isClaimedByMe) return 'success'
  if (isFull.value) return 'danger'
  if (props.task.claimCount > 0) return 'warning'
  return 'neutral'
})

const statusLabel = computed(() => {
  if (props.task.isClaimedByMe) return 'Jouw taak'
  if (isFull.value) return 'Vol'
  if (props.task.claimCount > 0)
    return `${props.task.claimCount}${props.task.maxCapacity ? '/' + props.task.maxCapacity : ''} geclaimd`
  return 'Beschikbaar'
})
</script>

<template>
  <BaseCard
    padding="none"
    :class="[
      'transition-all duration-200',
      task.isClaimedByMe && 'border-success-500 bg-success-50 dark:bg-success-950/20',
      isFull && !task.isClaimedByMe && 'opacity-75',
    ]"
  >
    <div class="p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3">
        <!-- Task info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="font-semibold text-[var(--text-primary)]">{{ task.title }}</h3>
            <BaseBadge :variant="statusVariant" size="sm">{{ statusLabel }}</BaseBadge>
          </div>
          <p v-if="task.description" class="mt-1 text-sm text-[var(--text-secondary)] line-clamp-2">
            {{ task.description }}
          </p>

          <!-- Claimants avatars -->
          <div
            v-if="task.claims && task.claims.length > 0"
            class="flex items-center gap-1.5 mt-3 flex-wrap"
          >
            <div class="flex -space-x-2">
              <BaseAvatar
                v-for="claim in task.claims.slice(0, 5)"
                :key="claim.id"
                :name="claim.anonymousName || claim.userName || '?'"
                size="xs"
                class="ring-2 ring-[var(--bg-surface)]"
              />
            </div>
            <span class="text-xs text-[var(--text-secondary)]">
              {{ task.claims.map((c) => c.anonymousName || c.userName).join(', ') }}
            </span>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-2 shrink-0">
          <!-- Initiator edit/delete -->
          <template v-if="isInitiator">
            <button
              type="button"
              class="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors"
              @click.stop="$emit('edit', task)"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
            <button
              type="button"
              class="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-danger-600 hover:bg-danger-50 transition-colors"
              @click.stop="$emit('delete', task.id)"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </template>

          <!-- Claim/unclaim button -->
          <template v-if="!isInitiator">
            <BaseButton
              v-if="task.isClaimedByMe"
              variant="secondary"
              size="sm"
              :loading="claimLoading"
              @click="$emit('unclaim', task.id)"
            >
              Teruggeven
            </BaseButton>
            <BaseButton
              v-else
              variant="primary"
              size="sm"
              :disabled="isFull"
              :loading="claimLoading"
              @click="$emit('claim', task.id)"
            >
              {{ isFull ? 'Vol' : 'Pakken' }}
            </BaseButton>
          </template>
        </div>
      </div>
    </div>
  </BaseCard>
</template>
