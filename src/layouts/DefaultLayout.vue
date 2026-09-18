<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppHeader from '@/components/organisms/AppHeader.vue'

const { t } = useI18n()
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[var(--bg-page)]">
    <AppHeader />
    <main class="flex-1">
      <RouterView />
    </main>
    <footer
      class="border-t border-[var(--border-default)] py-6 px-4 text-center text-xs text-[var(--text-tertiary)]"
    >
      <nav class="mb-3 flex justify-center gap-4">
        <RouterLink to="/about" class="hover:underline">{{ t('footer.about') }}</RouterLink>
        <RouterLink to="/contact" class="hover:underline">{{ t('footer.contact') }}</RouterLink>
        <RouterLink to="/privacy" class="hover:underline">{{ t('footer.privacy') }}</RouterLink>
      </nav>
      &copy; {{ new Date().getFullYear() }} wieDoetHet &mdash; Wie pakt welke taak?
    </footer>
  </div>
</template>
