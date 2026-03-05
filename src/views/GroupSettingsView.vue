<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGroupStore } from '@/stores/group'
import { useGroups } from '@/composables/useGroups'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseToggle from '@/components/ui/BaseToggle.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import ConfirmModal from '@/components/molecules/ConfirmModal.vue'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const groupStore = useGroupStore()
const { fetchGroup, updateGroup, deleteGroup, loading, error } = useGroups()

const group = computed(() => groupStore.currentGroup)

const name = ref('')
const isTemporary = ref(false)
const eventDate = ref('')
const requireClaimOne = ref(false)
const scorecardVisibility = ref('all')
const errors = ref({})
const saveSuccess = ref(false)
const showDeleteConfirm = ref(false)
const deleteLoading = ref(false)

onMounted(async () => {
  await fetchGroup(route.params.id)
})

watch(
  group,
  (g) => {
    if (!g) return
    name.value = g.name
    isTemporary.value = g.isTemporary ?? false
    eventDate.value = g.eventDate ?? ''
    requireClaimOne.value = g.requireClaimOne ?? false
    scorecardVisibility.value = g.scorecardVisibility ?? 'all'
  },
  { immediate: true }
)

function validate() {
  errors.value = {}
  if (!name.value.trim()) errors.value.name = t('groups.nameRequired')
  if (isTemporary.value && !eventDate.value) errors.value.eventDate = t('groups.dateRequired')
  return Object.keys(errors.value).length === 0
}

async function submit() {
  if (!validate()) return
  await updateGroup(route.params.id, {
    name: name.value.trim(),
    isTemporary: isTemporary.value,
    eventDate: isTemporary.value ? eventDate.value : null,
    requireClaimOne: requireClaimOne.value,
    scorecardVisibility: scorecardVisibility.value,
  })
  if (!error.value) {
    saveSuccess.value = true
    setTimeout(() => {
      saveSuccess.value = false
    }, 3000)
  }
}

async function confirmDelete() {
  deleteLoading.value = true
  await deleteGroup(route.params.id)
  deleteLoading.value = false
  if (!error.value) router.push('/dashboard')
}
</script>

<template>
  <div class="max-w-xl mx-auto px-4 sm:px-6 py-8">
    <button
      type="button"
      class="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6 transition-colors"
      @click="router.back()"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      {{ t('common.back') }}
    </button>

    <div v-if="loading && !group" class="flex justify-center py-20">
      <BaseSpinner size="lg" />
    </div>

    <template v-else-if="group">
      <h1 class="text-2xl font-bold text-[var(--text-primary)] mb-1">
        {{ t('groups.settingsTitle') }}
      </h1>
      <p class="text-sm text-[var(--text-secondary)] mb-8">{{ group.name }}</p>

      <div
        class="bg-[var(--bg-surface)] rounded-[1.25rem] border border-[var(--border-default)] p-6 shadow-sm mb-6"
      >
        <BaseAlert v-if="error" variant="danger" class="mb-5">{{ error }}</BaseAlert>
        <BaseAlert v-if="saveSuccess" variant="success" dismissible class="mb-5">
          {{ t('groups.savedSuccess') }}
        </BaseAlert>

        <form class="flex flex-col gap-6" @submit.prevent="submit">
          <BaseInput
            id="settings-name"
            v-model="name"
            :label="t('groups.nameLabel')"
            :error="errors.name"
            required
          />
          <BaseToggle
            v-model="isTemporary"
            :label="t('groups.temporaryLabel')"
            :description="t('groups.temporaryDesc')"
          />
          <BaseInput
            v-if="isTemporary"
            id="settings-event-date"
            v-model="eventDate"
            type="date"
            :label="t('groups.eventDateLabel')"
            :error="errors.eventDate"
          />
          <BaseToggle
            v-model="requireClaimOne"
            :label="t('groups.requireClaimLabel')"
            :description="t('groups.requireClaimDesc')"
          />

          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium text-[var(--text-primary)]">{{
              t('groups.visibilityLabel')
            }}</label>
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
            {{ t('common.save') }}
          </BaseButton>
        </form>
      </div>

      <!-- Danger zone -->
      <div class="bg-danger-50 border border-danger-100 rounded-[1.25rem] p-6">
        <h2 class="text-sm font-bold text-danger-700 mb-1">{{ t('groups.dangerZone') }}</h2>
        <p class="text-sm text-danger-600 mb-4">{{ t('groups.deleteWarning') }}</p>
        <BaseButton variant="danger" @click="showDeleteConfirm = true">
          {{ t('groups.deleteGroup') }}
        </BaseButton>
      </div>
    </template>

    <ConfirmModal
      :open="showDeleteConfirm"
      :title="t('groups.deleteTitle')"
      :message="t('groups.deleteMessage')"
      :confirm-label="t('groups.deleteGroup')"
      :loading="deleteLoading"
      variant="danger"
      @confirm="confirmDelete"
      @close="showDeleteConfirm = false"
    />
  </div>
</template>
