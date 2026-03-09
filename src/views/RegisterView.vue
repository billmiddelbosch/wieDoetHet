<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { usePushSubscription } from '@/composables/usePushSubscription'
import { trackEvent } from '@/lib/analytics'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'
import BaseModal from '@/components/ui/BaseModal.vue'

const { t } = useI18n()
const router = useRouter()
const { register, updateProfile } = useAuth()
const { installApp, isIos, isStandalone } = usePwaInstall()
const { subscribe: subscribePush } = usePushSubscription()

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

const supportsContactPicker = 'contacts' in navigator && 'ContactsManager' in window

async function pickContact() {
  try {
    const contacts = await navigator.contacts.select(['tel'], { multiple: false })
    const tel = contacts?.[0]?.tel?.[0]
    if (tel) phoneNumber.value = tel
  } catch {
    // User cancelled or API unavailable
  }
}

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
    trackEvent('profile_added')
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
  } finally {
    phoneLoading.value = false
  }

  if (isIos()) {
    if (isStandalone()) {
      // Already running inside the PWA — subscribe to push silently, then navigate
      subscribePush().catch(() => {})
      router.push('/dashboard')
    } else {
      // Safari on iOS — show manual install instructions
      showIosSheet.value = true
    }
    return
  }

  // Android / Chrome — trigger native install prompt, subscribe to push, then go to dashboard
  await installApp()
  subscribePush().catch(() => {})
  router.push('/dashboard')
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
            <li
v-for="benefit in ['phoneStepBenefit1', 'phoneStepBenefit2', 'phoneStepBenefit3']" :key="benefit"
              class="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <svg class="w-4 h-4 mt-0.5 shrink-0 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {{ t(`auth.${benefit}`) }}
            </li>
          </ul>

          <form class="flex flex-col gap-4" @submit.prevent="submitPhone">
            <div class="flex flex-col gap-1">
              <div class="flex items-end gap-2">
                <div class="flex-1">
                  <BaseInput
                    id="reg-phone"
                    v-model="phoneNumber"
                    type="tel"
                    autocomplete="tel"
                    :label="t('profile.phoneLabel')"
                    :placeholder="t('profile.phonePlaceholder')"
                    :error="phoneError"
                  />
                </div>
                <button
                  v-if="supportsContactPicker"
                  type="button"
                  class="flex-shrink-0 h-[42px] px-3 rounded-[0.625rem] border border-[var(--border-default)] hover:border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  :title="t('auth.pickContact')"
                  @click="pickContact"
                >
                  <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </button>
              </div>
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
    <div class="flex flex-col gap-6">
      <p class="text-sm text-[var(--text-secondary)]">{{ t('auth.iosInstallIntro') }}</p>

      <!-- Step 1 -->
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0 w-7 h-7 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-xs font-bold text-brand-600">1</div>
        <div class="flex flex-col gap-2">
          <p class="text-sm text-[var(--text-primary)]">{{ t('auth.iosInstallStep1') }}</p>
          <!-- Safari share button visual -->
          <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-default)] w-fit">
            <svg class="w-5 h-5 text-[#007AFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
            </svg>
            <span class="text-xs text-[var(--text-secondary)]">{{ t('auth.iosInstallShareLabel') }}</span>
          </div>
        </div>
      </div>

      <!-- Step 2 -->
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0 w-7 h-7 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-xs font-bold text-brand-600">2</div>
        <div class="flex flex-col gap-2">
          <p class="text-sm text-[var(--text-primary)]">{{ t('auth.iosInstallStep2') }}</p>
          <!-- "Zet op beginscherm" visual -->
          <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-default)] w-fit">
            <svg class="w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="5" y="3" width="14" height="14" rx="2"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 11v6m0 0l-2-2m2 2l2-2"/>
            </svg>
            <span class="text-xs text-[var(--text-secondary)]">{{ t('auth.iosInstallAddLabel') }}</span>
          </div>
        </div>
      </div>

      <BaseButton variant="primary" size="lg" full @click="router.push('/dashboard')">
        {{ t('auth.iosInstallDone') }}
      </BaseButton>
    </div>
  </BaseModal>
</template>
