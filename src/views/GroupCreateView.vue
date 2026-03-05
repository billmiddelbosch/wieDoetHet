<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGroups } from '@/composables/useGroups'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'

const { t } = useI18n()
const router = useRouter()
const { createGroup, loading, error } = useGroups()

const name = ref('')
const isTemporary = ref(false)
const eventDate = ref('')
const requireClaimOne = ref(false)
const scorecardVisibility = ref('all')
const errors = ref({})

function validate() {
  errors.value = {}
  if (!name.value.trim()) errors.value.name = t('groups.nameRequired')
  if (isTemporary.value && !eventDate.value) errors.value.eventDate = t('groups.dateRequired')
  return Object.keys(errors.value).length === 0
}

async function submit() {
  if (!validate()) return
  const group = await createGroup({
    name: name.value.trim(),
    isTemporary: isTemporary.value,
    eventDate: isTemporary.value ? eventDate.value : null,
    requireClaimOne: requireClaimOne.value,
    scorecardVisibility: scorecardVisibility.value,
  })
  if (group) router.push(`/groups/${group.id}`)
}
</script>

<template>
  <div class="max-w-xl mx-auto px-4 sm:px-6 py-8">
    <div class="mb-8">
      <button
        type="button"
        class="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4 transition-colors"
        @click="router.back()"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {{ t('common.back') }}
      </button>
      <h1 class="text-2xl font-bold text-[var(--text-primary)]">{{ t('groups.createTitle') }}</h1>
      <p class="text-sm text-[var(--text-secondary)] mt-1">{{ t('groups.createSubtitle') }}</p>
    </div>

    <div
      class="bg-[var(--bg-surface)] rounded-[1.25rem] border border-[var(--border-default)] p-6 shadow-sm"
    >
      <BaseAlert v-if="error" variant="danger" class="mb-5">{{ error }}</BaseAlert>

      <form class="flex flex-col gap-6" @submit.prevent="submit">
        <!-- Group name -->
        <BaseInput
          id="group-name"
          v-model="name"
          :label="t('groups.nameLabel')"
          :placeholder="t('groups.namePlaceholder')"
          :error="errors.name"
          required
        />

        <!-- Temporary toggle -->
        <BaseToggle
          v-model="isTemporary"
          :label="t('groups.temporaryLabel')"
          :description="t('groups.temporaryDesc')"
        />

        <!-- Event date (when temporary) -->
        <BaseInput
          v-if="isTemporary"
          id="group-event-date"
          v-model="eventDate"
          type="date"
          :label="t('groups.eventDateLabel')"
          :error="errors.eventDate"
        />

        <!-- Require claim one -->
        <BaseToggle
          v-model="requireClaimOne"
          :label="t('groups.requireClaimLabel')"
          :description="t('groups.requireClaimDesc')"
        />

        <!-- Scorecard visibility -->
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-[var(--text-primary)]">
            {{ t('groups.visibilityLabel') }}
          </label>
          <div class="flex flex-col gap-2">
            <label
              v-for="opt in ['all', 'initiator']"
              :key="opt"
              class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors"
              :class="
                scorecardVisibility === opt
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'
              "
            >
              <input
                v-model="scorecardVisibility"
                type="radio"
                :value="opt"
                class="accent-brand-500"
              />
              <div>
                <p class="text-sm font-medium text-[var(--text-primary)]">
                  {{ t(`groups.visibility.${opt}`) }}
                </p>
                <p class="text-xs text-[var(--text-secondary)]">
                  {{ t(`groups.visibilityDesc.${opt}`) }}
                </p>
              </div>
            </label>
          </div>
        </div>

        <BaseButton type="submit" variant="primary" size="lg" full :loading="loading">
          {{ t('groups.createCta') }}
        </BaseButton>
      </form>
    </div>
  </div>
</template>
