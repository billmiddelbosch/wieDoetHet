<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import BaseButton from '@/components/ui/BaseButton.vue'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const deferredPrompt = ref(null)
const showInstallBanner = ref(false)

onMounted(() => {
  if (authStore.isAuthenticated) {
    router.replace('/dashboard')
    return
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt.value = e
    showInstallBanner.value = true
  })
})

async function installPwa() {
  if (!deferredPrompt.value) return
  deferredPrompt.value.prompt()
  await deferredPrompt.value.userChoice
  deferredPrompt.value = null
  showInstallBanner.value = false
}

const steps = [
  {
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    label: 'landing.step1',
    desc: 'landing.step1Desc',
  },
  {
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    label: 'landing.step2',
    desc: 'landing.step2Desc',
  },
  {
    icon: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z',
    label: 'landing.step3',
    desc: 'landing.step3Desc',
  },
]

const features = [
  { icon: '👤', title: 'landing.feat1', desc: 'landing.feat1Desc' },
  { icon: '💬', title: 'landing.feat2', desc: 'landing.feat2Desc' },
  { icon: '✅', title: 'landing.feat3', desc: 'landing.feat3Desc' },
  { icon: '🔒', title: 'landing.feat4', desc: 'landing.feat4Desc' },
]
</script>

<template>
  <div class="min-h-screen">
    <!-- PWA install banner -->
    <Transition name="slide-up">
      <div
        v-if="showInstallBanner"
        class="bg-brand-500 text-white px-4 py-3 flex items-center justify-between gap-4"
      >
        <p class="text-sm font-medium">{{ t('landing.installHint') }}</p>
        <div class="flex gap-2 shrink-0">
          <button
            type="button"
            class="text-white/80 hover:text-white text-xs"
            @click="showInstallBanner = false"
          >
            {{ t('common.dismiss') }}
          </button>
          <button
            type="button"
            class="bg-white text-brand-600 text-xs font-semibold px-3 py-1 rounded-full"
            @click="installPwa"
          >
            {{ t('landing.install') }}
          </button>
        </div>
      </div>
    </Transition>

    <!-- Hero -->
    <section class="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-20 text-center">
      <div
        class="inline-flex items-center gap-2 bg-brand-100 text-brand-700 text-xs font-semibold px-4 py-1.5 rounded-full mb-6"
      >
        <svg
          class="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        {{ t('landing.badge') }}
      </div>
      <h1 class="text-4xl sm:text-5xl font-extrabold text-[var(--text-primary)] leading-tight mb-4">
        {{ t('landing.headline') }}
        <span class="text-brand-500"> {{ t('landing.headlineAccent') }}</span>
      </h1>
      <p class="text-lg text-[var(--text-secondary)] max-w-xl mx-auto mb-10">
        {{ t('landing.subheadline') }}
      </p>
      <div class="flex flex-col sm:flex-row gap-3 justify-center">
        <BaseButton variant="primary" size="lg" @click="router.push('/groups/new')">
          {{ t('landing.cta') }}
        </BaseButton>
        <BaseButton variant="secondary" size="lg" @click="router.push('/register')">
          {{ t('landing.ctaSecondary') }}
        </BaseButton>
      </div>
    </section>

    <!-- How it works -->
    <section
      class="bg-[var(--bg-surface)] border-y border-[var(--border-default)] py-16 px-4 sm:px-6"
    >
      <div class="max-w-3xl mx-auto">
        <h2 class="text-2xl font-bold text-[var(--text-primary)] text-center mb-12">
          {{ t('landing.howTitle') }}
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div
            v-for="(step, i) in steps"
            :key="i"
            class="flex flex-col items-center text-center gap-4"
          >
            <div class="h-14 w-14 rounded-full bg-brand-100 flex items-center justify-center">
              <svg
                class="h-7 w-7 text-brand-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
              >
                <path stroke-linecap="round" stroke-linejoin="round" :d="step.icon" />
              </svg>
            </div>
            <div>
              <div class="text-xs font-bold text-brand-500 mb-1">Stap {{ i + 1 }}</div>
              <h3 class="font-semibold text-[var(--text-primary)] mb-1">{{ t(step.label) }}</h3>
              <p class="text-sm text-[var(--text-secondary)]">{{ t(step.desc) }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <h2 class="text-2xl font-bold text-[var(--text-primary)] text-center mb-12">
        {{ t('landing.featuresTitle') }}
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div
          v-for="(feat, i) in features"
          :key="i"
          class="bg-[var(--bg-surface)] rounded-[1rem] border border-[var(--border-default)] p-6 flex gap-4"
        >
          <div class="text-2xl leading-none mt-0.5">{{ feat.icon }}</div>
          <div>
            <h3 class="font-semibold text-[var(--text-primary)] mb-1">{{ t(feat.title) }}</h3>
            <p class="text-sm text-[var(--text-secondary)]">{{ t(feat.desc) }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Bottom CTA -->
    <section class="max-w-3xl mx-auto px-4 sm:px-6 pb-20 text-center">
      <div class="bg-brand-500 rounded-[1.25rem] py-12 px-6 text-white">
        <h2 class="text-2xl font-bold mb-3">{{ t('landing.ctaBlockTitle') }}</h2>
        <p class="text-brand-100 mb-8 max-w-sm mx-auto">{{ t('landing.ctaBlockDesc') }}</p>
        <BaseButton
          variant="secondary"
          size="lg"
          class="!bg-white !text-brand-600 hover:!bg-brand-50"
          @click="router.push('/groups/new')"
        >
          {{ t('landing.cta') }}
        </BaseButton>
      </div>
    </section>
  </div>
</template>
