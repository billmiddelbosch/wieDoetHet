<script setup>
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'

const { t } = useI18n()
const authStore = useAuthStore()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()

const isAuthenticated = computed(() => authStore.isAuthenticated)
const user = computed(() => authStore.user)

function logout() {
  authStore.logout()
  router.push('/')
}
</script>

<template>
  <header
    class="sticky top-0 z-40 bg-[var(--bg-surface)] border-b border-[var(--border-default)] backdrop-blur-sm"
  >
    <div class="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
      <!-- Logo -->
      <RouterLink to="/" class="flex items-center gap-2 shrink-0">
        <div class="h-8 w-8 rounded-full bg-brand-500 flex items-center justify-center">
          <svg
            class="h-4 w-4 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
            />
          </svg>
        </div>
        <span class="font-bold text-[var(--text-primary)] text-base">wieDoetHet</span>
      </RouterLink>

      <!-- Right side -->
      <div class="flex items-center gap-2">
        <!-- Dark mode toggle -->
        <button
          type="button"
          class="p-2 rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors"
          :aria-label="isDark ? t('theme.switchLight') : t('theme.switchDark')"
          @click="toggleTheme"
        >
          <svg
            v-if="isDark"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 110 8 4 4 0 010-8z"
            />
          </svg>
          <svg
            v-else
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        </button>

        <!-- Authenticated nav -->
        <template v-if="isAuthenticated">
          <RouterLink to="/dashboard">
            <button
              type="button"
              class="p-1.5 rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
            >
              <BaseAvatar :name="user?.name ?? ''" size="sm" />
            </button>
          </RouterLink>
          <BaseButton variant="ghost" size="sm" @click="logout">
            {{ t('nav.logout') }}
          </BaseButton>
        </template>

        <!-- Guest nav -->
        <template v-else>
          <RouterLink to="/login">
            <BaseButton variant="ghost" size="sm">{{ t('nav.login') }}</BaseButton>
          </RouterLink>
          <RouterLink to="/register">
            <BaseButton variant="primary" size="sm">{{ t('nav.register') }}</BaseButton>
          </RouterLink>
        </template>
      </div>
    </div>
  </header>
</template>
