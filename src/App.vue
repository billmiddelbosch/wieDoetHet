<script setup>
import { onMounted } from 'vue'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import { usePwaInstall } from '@/composables/usePwaInstall'

const { initPwaInstall } = usePwaInstall()
onMounted(initPwaInstall)
</script>

<template>
  <DefaultLayout />
</template>
