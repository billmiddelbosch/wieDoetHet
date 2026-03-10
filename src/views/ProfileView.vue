<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useAuth } from '@/composables/useAuth'
import { useHead } from '@/composables/useHead'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'

const { t } = useI18n()

useHead({
  title: t('seo.profile.title'),
  noindex: true,
})
const router = useRouter()
const authStore = useAuthStore()
const { fetchMe, updateProfile } = useAuth()

const user = computed(() => authStore.user)

const phoneNumber = ref('')
const loading = ref(false)
const error = ref(null)
const saveSuccess = ref(false)
const phoneError = ref('')

onMounted(async () => {
  if (!user.value) await fetchMe()
  phoneNumber.value = user.value?.phoneNumber ?? ''
})

function validate() {
  phoneError.value = ''
  if (phoneNumber.value && !/^\+[1-9]\d{7,14}$/.test(phoneNumber.value)) {
    phoneError.value = t('profile.phoneInvalid')
    return false
  }
  return true
}

async function submit() {
  if (!validate()) return
  loading.value = true
  error.value = null
  try {
    await updateProfile({ phoneNumber: phoneNumber.value || null })
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 3000)
  } catch (e) {
    error.value = e?.response?.data?.message ?? t('profile.saveFailed')
  } finally {
    loading.value = false
  }
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

    <h1 class="text-2xl font-bold text-[var(--text-primary)] mb-1">{{ t('profile.title') }}</h1>
    <p class="text-sm text-[var(--text-secondary)] mb-8">{{ user?.email }}</p>

    <div class="bg-[var(--bg-surface)] rounded-[1.25rem] border border-[var(--border-default)] p-6 shadow-sm">
      <BaseAlert v-if="error" variant="danger" class="mb-5">{{ error }}</BaseAlert>
      <BaseAlert v-if="saveSuccess" variant="success" dismissible class="mb-5">
        {{ t('profile.savedSuccess') }}
      </BaseAlert>

      <form class="flex flex-col gap-6" @submit.prevent="submit">
        <!-- Read-only fields -->
        <BaseInput
          id="profile-name"
          :model-value="user?.name ?? ''"
          :label="t('profile.nameLabel')"
          disabled
        />
        <BaseInput
          id="profile-email"
          :model-value="user?.email ?? ''"
          :label="t('profile.emailLabel')"
          type="email"
          disabled
        />

        <!-- Phone number -->
        <div class="flex flex-col gap-1">
          <BaseInput
            id="profile-phone"
            v-model="phoneNumber"
            :label="t('profile.phoneLabel')"
            :placeholder="t('profile.phonePlaceholder')"
            :error="phoneError"
            type="tel"
            autocomplete="tel"
          />
          <p class="text-xs text-[var(--text-secondary)]">{{ t('profile.phoneHint') }}</p>
        </div>

        <!-- WhatsApp notice -->
        <div class="flex items-start gap-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)] px-4 py-3">
          <svg class="h-4 w-4 mt-0.5 shrink-0 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4m0-4h.01" />
          </svg>
          <p class="text-xs text-[var(--text-secondary)]">{{ t('profile.whatsappNotice') }}</p>
        </div>

        <BaseButton type="submit" variant="primary" size="lg" full :loading="loading">
          {{ t('common.save') }}
        </BaseButton>
      </form>
    </div>
  </div>
</template>
