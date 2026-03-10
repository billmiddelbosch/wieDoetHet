<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGroups } from '@/composables/useGroups'
import { useHead } from '@/composables/useHead'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { fetchGroupByShareToken, error } = useGroups()

// Provide a meaningful title while the share token resolves.
// Once resolved the router navigates to GroupDetailView which sets its own meta.
useHead({
  title: t('seo.shareRedirect.title'),
  description: t('seo.shareRedirect.description'),
})

onMounted(async () => {
  const group = await fetchGroupByShareToken(route.params.shareToken)
  if (group) {
    router.replace(`/groups/${group.id}`)
  }
})
</script>

<template>
  <div class="min-h-[80vh] flex flex-col items-center justify-center gap-6 px-4">
    <BaseAlert v-if="error" variant="danger" class="max-w-sm w-full">
      Ongeldige link. Controleer of je de juiste link hebt.
    </BaseAlert>
    <template v-else>
      <BaseSpinner size="lg" />
      <p class="text-sm text-[var(--text-secondary)]">Groep laden...</p>
    </template>
  </div>
</template>
