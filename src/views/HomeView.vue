<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <main class="p-8">
    <h1 class="text-3xl font-bold">{{ t('home.title') }}</h1>
    <p class="mt-4 text-lg">{{ t('home.welcome') }}</p>
  </main>
</template>
