<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { usePwaInstall } from '@/composables/usePwaInstall'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseModal from '@/components/ui/BaseModal.vue'

const { t } = useI18n()
const router = useRouter()
const { register, updateProfile } = useAuth()
const { installApp, isIos, isStandalone } = usePwaInstall()

const showIosSheet = ref(false)

const name = ref('')
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const loading = ref(false)
const serverError = ref('')
const errors = ref({})

// Step 2 — phone + PWA prompt
const step = ref(1)
const phoneNumber = ref('')
const phoneError = ref('')
const phoneLoading = ref(false)

function validate() {
  errors.value = {}
  if (!name.value.trim()) errors.value.name = t('auth.nameRequired')
  if (!email.value) errors.value.email = t('auth.emailRequired')
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value))
    errors.value.email = t('auth.emailInvalid')
  if (!password.value || password.value.length < 8) errors.value.password = t('auth.passwordMin')
  if (password.value !== passwordConfirm.value)
    errors.value.passwordConfirm = t('auth.passwordMismatch')
  return Object.keys(errors.value).length === 0
}

async function submit() {
  if (!validate()) return
  loading.value = true
  serverError.value = ''
  try {
    await register(name.value.trim(), email.value, password.value)
    step.value = 2
  } catch (err) {
    serverError.value = err?.response?.data?.message ?? t('auth.registerFailed')
  } finally {
    loading.value = false
  }
}

async function submitPhone() {
  phoneError.value = ''
  if (phoneNumber.value && !/^\+[1-9]\d{7,14}$/.test(phoneNumber.value)) {
    phoneError.value = t('profile.phoneInvalid')
    return
  }
  phoneLoading.value = true
  try {
    if (phoneNumber.value) await updateProfile({ phoneNumber: phoneNumber.value })
    if (isIos() && !isStandalone()) {
      showIosSheet.value = true
      return
    }
    await installApp()
  } finally {
    phoneLoading.value = false
    if (!showIosSheet.value) router.push('/dashboard')
  }
}
</script>

<template>
  <div class="min-h-[80vh] flex items-center justify-center px-4 py-12">
    <div class="w-full max-w-sm">

      <!-- Step 1: Registration form -->
      <template v-if="step === 1">
        <div class="text-center mb-8">
          <h1 class="text-2xl font-bold text-[var(--text-primary)]">{{ t('auth.registerTitle') }}</h1>
          <p class="mt-1 text-sm text-[var(--text-secondary)]">{{ t('auth.registerSubtitle') }}</p>
        </div>

        <div class="bg-[var(--bg-surface)] rounded-[1.25rem] border border-[var(--border-default)] p-6 shadow-sm">
          <BaseAlert v-if="serverError" variant="danger" dismissible class="mb-5" @dismiss="serverError = ''">
            {{ serverError }}
          </BaseAlert>

          <form class="flex flex-col gap-5" @submit.prevent="submit">
            <BaseInput
              id="reg-name"
              v-model="name"
              :label="t('auth.nameLabel')"
              :placeholder="t('auth.namePlaceholder')"
              :error="errors.name"
              required
            />
            <BaseInput
              id="reg-email"
              v-model="email"
              type="email"
              :label="t('auth.emailLabel')"
              :placeholder="t('auth.emailPlaceholder')"
              :error="errors.email"
              required
            />
            <BaseInput
              id="reg-password"
              v-model="password"
              type="password"
              :label="t('auth.passwordLabel')"
              :placeholder="t('auth.passwordPlaceholder')"
              :error="errors.password"
              :hint="t('auth.passwordHint')"
              required
            />
            <BaseInput
              id="reg-password-confirm"
              v-model="passwordConfirm"
              type="password"
              :label="t('auth.passwordConfirmLabel')"
              :placeholder="t('auth.passwordConfirmPlaceholder')"
              :error="errors.passwordConfirm"
              required
            />
            <BaseButton type="submit" variant="primary" size="lg" full :loading="loading">
              {{ t('auth.registerCta') }}
            </BaseButton>
          </form>
        </div>

        <p class="text-center text-sm text-[var(--text-secondary)] mt-6">
          {{ t('auth.hasAccount') }}
          <RouterLink to="/login" class="text-brand-500 font-semibold hover:underline">
            {{ t('auth.loginLink') }}
          </RouterLink>
        </p>
      </template>

      <!-- Step 2: Phone number prompt -->
      <template v-else>
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-50 border border-brand-100 mb-4">
            <svg class="w-7 h-7 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-[var(--text-primary)]">{{ t('auth.phoneStepTitle') }}</h1>
          <p class="mt-2 text-sm text-[var(--text-secondary)]">{{ t('auth.phoneStepSubtitle') }}</p>
        </div>

        <div class="bg-[var(--bg-surface)] rounded-[1.25rem] border border-[var(--border-default)] p-6 shadow-sm">
          <!-- Benefits list -->
          <ul class="flex flex-col gap-2 mb-5">
            <li v-for="benefit in ['phoneStepBenefit1', 'phoneStepBenefit2', 'phoneStepBenefit3']" :key="benefit"
              class="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <svg class="w-4 h-4 mt-0.5 shrink-0 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {{ t(`auth.${benefit}`) }}
            </li>
          </ul>

          <form class="flex flex-col gap-4" @submit.prevent="submitPhone">
            <div class="flex flex-col gap-1">
              <BaseInput
                id="reg-phone"
                v-model="phoneNumber"
                type="tel"
                :label="t('profile.phoneLabel')"
                :placeholder="t('profile.phonePlaceholder')"
                :error="phoneError"
              />
              <p class="text-xs text-[var(--text-secondary)]">{{ t('profile.phoneHint') }}</p>
            </div>
            <BaseButton type="submit" variant="primary" size="lg" full :loading="phoneLoading">
              {{ t('auth.phoneStepCta') }}
            </BaseButton>
            <button
              type="button"
              class="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-center"
              @click="router.push('/dashboard')"
            >
              {{ t('auth.phoneStepSkip') }}
            </button>
          </form>
        </div>
      </template>

    </div>
  </div>

  <!-- iOS install instructions -->
  <BaseModal :open="showIosSheet" size="sm" :title="t('auth.iosInstallTitle')" @close="router.push('/dashboard')">
    <div class="flex flex-col gap-5">
      <p class="text-sm text-[var(--text-secondary)]">{{ t('auth.iosInstallIntro') }}</p>

      <!-- Step 1 -->
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0 w-8 h-8 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-sm font-bold text-brand-600">1</div>
        <div class="flex flex-col gap-1">
          <p class="text-sm text-[var(--text-primary)]">{{ t('auth.iosInstallStep1') }}</p>
          <!-- iOS share icon -->
          <svg class="w-6 h-6 text-[#007AFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </div>
      </div>

      <!-- Step 2 -->
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0 w-8 h-8 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-sm font-bold text-brand-600">2</div>
        <p class="text-sm text-[var(--text-primary)]">{{ t('auth.iosInstallStep2') }}</p>
      </div>

      <BaseButton variant="primary" size="lg" full @click="router.push('/dashboard')">
        {{ t('auth.iosInstallDone') }}
      </BaseButton>
    </div>
  </BaseModal>
</template>
