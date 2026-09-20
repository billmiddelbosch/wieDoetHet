<script setup>
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  // 'templates' | 'log'
  active: { type: String, required: true },
})

const tabs = [
  { id: 'templates', to: '/admin/automation', label: () => t('admin.automation.tabTemplates') },
  { id: 'log', to: '/admin/automation/log', label: () => t('admin.automation.tabLog') },
]
</script>

<template>
  <div class="flex gap-2 mb-6" role="tablist">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.id"
      :to="tab.to"
      role="tab"
      :aria-selected="active === tab.id"
      :class="[
        'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
        active === tab.id
          ? 'bg-brand-500 text-white'
          : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
      ]"
    >
      {{ tab.label() }}
    </RouterLink>
  </div>
</template>
