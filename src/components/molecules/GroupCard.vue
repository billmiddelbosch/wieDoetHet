<script setup>
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'

defineProps({
  group: { type: Object, required: true },
})

defineEmits(['click'])
</script>

<template>
  <BaseCard
    hoverable
    padding="none"
    as="button"
    class="w-full text-left"
    @click="$emit('click', group)"
  >
    <div class="p-5 flex items-start gap-4">
      <BaseAvatar :src="group.pictureUrl" :name="group.name" size="lg" />
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-semibold text-[var(--text-primary)] truncate">{{ group.name }}</h3>
          <BaseBadge v-if="group.isTemporary" variant="warning" size="sm">Tijdelijk</BaseBadge>
        </div>
        <p class="text-sm text-[var(--text-secondary)] mt-0.5">
          {{ group.taskCount ?? 0 }} taken &middot; {{ group.memberCount ?? 0 }} leden
        </p>
        <p v-if="group.eventDate" class="text-xs text-[var(--text-tertiary)] mt-1">
          {{
            new Date(group.eventDate).toLocaleDateString('nl-NL', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          }}
        </p>
      </div>
    </div>
  </BaseCard>
</template>
