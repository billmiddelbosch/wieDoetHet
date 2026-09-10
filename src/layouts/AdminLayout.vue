<script setup>
import { RouterView, RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const route = useRoute()

const tabs = [
  { to: '/admin', name: 'admin-dashboard', label: () => t('admin.subnav.dashboard') },
  { to: '/admin/users', name: 'admin-users', label: () => t('admin.subnav.users') },
  { to: '/admin/groups', name: 'admin-groups', label: () => t('admin.subnav.groups') },
]

function isActive(tabName) {
  if (tabName === 'admin-dashboard') return route.name === 'admin-dashboard'
  if (tabName === 'admin-users') return route.name === 'admin-users' || route.name === 'admin-user-detail'
  if (tabName === 'admin-groups') return route.name === 'admin-groups' || route.name === 'admin-group-detail'
  return false
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[var(--bg-page)]">
    <nav class="border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 flex items-center gap-1">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.name"
          :to="tab.to"
          :class="[
            'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            isActive(tab.name)
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          ]"
        >
          {{ tab.label() }}
        </RouterLink>
      </div>
    </nav>

    <main class="flex-1">
      <RouterView />
    </main>
  </div>
</template>
