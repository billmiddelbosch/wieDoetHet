<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { trackEvent } from '@/lib/analytics'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'

const { t } = useI18n()
const router = useRouter()
const { register } = useAuth()
const { installApp, canInstall, isIos, isStandalone } = usePwaInstall()

// Step 1 — registration form
const step = ref(1)
const name = ref('')
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const loading = ref(false)
const serverError = ref('')
const errors = ref({})

// Step 2 — install
const installing = ref(false)

// Determine which install scenario to show in step 2
const installScenario = computed(() => {
  if (isStandalone()) return 'standalone'
  if (isIos())        return 'ios'
  if (canInstall())   return 'android'
  return 'other'
})

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
    // If already standalone skip install step — go straight to dashboard
    if (isStandalone()) {
      router.push('/dashboard')
    } else {
      step.value = 2
    }
  } catch (err) {
    serverError.value = err?.response?.data?.message ?? t('auth.registerFailed')
  } finally {
    loading.value = false
  }
}

async function doInstall() {
  installing.value = true
  const accepted = await installApp()
  installing.value = false
  trackEvent('pwa_install_prompted', { outcome: accepted ? 'accepted' : 'dismissed' })
  router.push('/dashboard')
}

function skipInstall() {
  trackEvent('pwa_install_skipped')
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

      <!-- Step 2: PWA install -->
      <template v-else>

        <!-- Shared header -->
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-50 border border-brand-100 mb-4">
            <svg class="w-7 h-7 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-[var(--text-primary)]">{{ t('auth.installStepTitle') }}</h1>
          <p class="mt-2 text-sm text-[var(--text-secondary)]">{{ t('auth.installStepSubtitle') }}</p>
        </div>

        <!-- SCENARIO: Android / Chrome — native install prompt available -->
        <template v-if="installScenario === 'android'">
          <div class="bg-[var(--bg-surface)] rounded-[1.25rem] border border-[var(--border-default)] p-6 shadow-sm">
            <ul class="flex flex-col gap-2 mb-6">
              <li
                v-for="benefit in ['installStepBenefit1', 'installStepBenefit2', 'installStepBenefit3']"
                :key="benefit"
                class="flex items-start gap-2 text-sm text-[var(--text-secondary)]"
              >
                <svg class="w-4 h-4 mt-0.5 shrink-0 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {{ t(`auth.${benefit}`) }}
              </li>
            </ul>
            <div class="flex flex-col gap-3">
              <BaseButton variant="primary" size="lg" full :loading="installing" @click="doInstall">
                {{ t('auth.installCta') }}
              </BaseButton>
              <button
                type="button"
                class="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-center"
                @click="skipInstall"
              >
                {{ t('auth.installSkip') }}
              </button>
            </div>
          </div>
        </template>

        <!-- SCENARIO: iOS / Safari — manual Share → Add to Home Screen instructions -->
        <template v-else-if="installScenario === 'ios'">
          <div class="bg-[var(--bg-surface)] rounded-[1.25rem] border border-[var(--border-default)] p-6 shadow-sm">
            <div class="flex flex-col gap-6">
              <p class="text-sm text-[var(--text-secondary)]">{{ t('auth.iosInstallIntro') }}</p>

              <!-- Step 1: Share button -->
              <div class="flex items-start gap-3">
                <div class="flex-shrink-0 w-7 h-7 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-xs font-bold text-brand-600">1</div>
                <div class="flex flex-col gap-2">
                  <p class="text-sm text-[var(--text-primary)]">{{ t('auth.iosInstallStep1') }}</p>
                  <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-default)] w-fit">
                    <svg class="w-5 h-5 text-[#007AFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
                    </svg>
                    <span class="text-xs text-[var(--text-secondary)]">{{ t('auth.iosInstallShareLabel') }}</span>
                  </div>
                </div>
              </div>

              <!-- Step 2: Add to Home Screen -->
              <div class="flex items-start gap-3">
                <div class="flex-shrink-0 w-7 h-7 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-xs font-bold text-brand-600">2</div>
                <div class="flex flex-col gap-2">
                  <p class="text-sm text-[var(--text-primary)]">{{ t('auth.iosInstallStep2') }}</p>
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
          </div>
        </template>

        <!-- SCENARIO: other — desktop or unsupported browser -->
        <template v-else>
          <div class="bg-[var(--bg-surface)] rounded-[1.25rem] border border-[var(--border-default)] p-6 shadow-sm">
            <div class="flex flex-col gap-4">
              <p class="text-sm text-[var(--text-secondary)]">{{ t('auth.installDesktopDesc') }}</p>
              <BaseButton variant="primary" size="lg" full @click="router.push('/dashboard')">
                {{ t('auth.installDashboard') }}
              </BaseButton>
            </div>
          </div>
        </template>

      </template>
    </div>
  </div>
</template>
