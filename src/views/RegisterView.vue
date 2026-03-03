<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'

const { t } = useI18n()
const router = useRouter()
const { register } = useAuth()

const name = ref('')
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const loading = ref(false)
const serverError = ref('')
const errors = ref({})

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
    router.push('/dashboard')
  } catch (err) {
    serverError.value = err?.response?.data?.message ?? t('auth.registerFailed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-[80vh] flex items-center justify-center px-4 py-12">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-[var(--text-primary)]">{{ t('auth.registerTitle') }}</h1>
        <p class="mt-1 text-sm text-[var(--text-secondary)]">{{ t('auth.registerSubtitle') }}</p>
      </div>

      <div
        class="bg-[var(--bg-surface)] rounded-[1.25rem] border border-[var(--border-default)] p-6 shadow-sm"
      >
        <BaseAlert
          v-if="serverError"
          variant="danger"
          dismissible
          class="mb-5"
          @dismiss="serverError = ''"
        >
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
    </div>
  </div>
</template>
