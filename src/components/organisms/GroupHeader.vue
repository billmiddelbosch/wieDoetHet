<script setup>
import { useI18n } from 'vue-i18n'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const { t } = useI18n()

defineProps({
  group: { type: Object, required: true },
  isInitiator: { type: Boolean, default: false },
})

defineEmits(['share', 'settings', 'scorecard'])
</script>

<template>
  <div class="bg-[var(--bg-surface)] border-b border-[var(--border-default)] px-4 sm:px-6 py-5">
    <div class="max-w-2xl mx-auto flex items-start gap-4">
      <BaseAvatar :src="group.pictureUrl" :name="group.name" size="xl" />
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <h1 class="text-xl font-bold text-[var(--text-primary)]">{{ group.name }}</h1>
            <p class="text-sm text-[var(--text-secondary)] mt-0.5">
              {{ t('groups.by') }} {{ group.initiatorName ?? t('groups.unknownInitiator') }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <BaseBadge v-if="group.isTemporary" variant="warning">{{
              t('groups.temporary')
            }}</BaseBadge>
          </div>
        </div>

        <!-- Actions row -->
        <div class="flex items-center gap-2 mt-3 flex-wrap">
          <BaseButton variant="secondary" size="sm" @click="$emit('scorecard')">
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
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            {{ t('groups.scorecard') }}
          </BaseButton>
          <BaseButton variant="secondary" size="sm" @click="$emit('share')">
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
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
            {{ t('groups.share') }}
          </BaseButton>
          <BaseButton v-if="isInitiator" variant="ghost" size="sm" @click="$emit('settings')">
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
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            {{ t('groups.settings') }}
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>
