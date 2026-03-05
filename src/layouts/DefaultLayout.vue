<script setup>
import { RouterView } from 'vue-router'
import AppHeader from '@/components/organisms/AppHeader.vue'
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
      &copy; {{ new Date().getFullYear() }} wieDoetHet &mdash; Wie pakt welke taak?
    </footer>
  </div>
</template>
