<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGroups } from '@/composables/useGroups'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'
import BaseAlert from '@/components/ui/BaseAlert.vue'

const route = useRoute()
const router = useRouter()
const { fetchGroupByShareToken, error } = useGroups()

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
