<script setup>
import { useI18n } from 'vue-i18n'
import { RouterLink, RouterView } from 'vue-router'

const { t } = useI18n()
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="bg-white shadow px-8 py-4 flex gap-6">
      <nav class="flex gap-4">
        <RouterLink to="/" class="text-blue-600 hover:underline">{{ t('nav.home') }}</RouterLink>
        <RouterLink to="/about" class="text-blue-600 hover:underline">{{ t('nav.about') }}</RouterLink>
      </nav>
    </header>
    <main class="flex-1">
      <RouterView />
    </main>
  </div>
</template>
