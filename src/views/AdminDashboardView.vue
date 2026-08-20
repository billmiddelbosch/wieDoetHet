<script setup>
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAdminStats } from '@/composables/useAdminStats'
import { useHead } from '@/composables/useHead'
import { formatDate } from '@/utils'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'

const { t } = useI18n()
const router = useRouter()

useHead({
  title: t('seo.adminDashboard.title'),
  noindex: true,
})

const { stats, loading, error, fetchStats } = useAdminStats()

onMounted(() => fetchStats())
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-8">
    <h1 class="text-2xl font-bold text-[var(--text-primary)] mb-8">{{ t('admin.dashboard.title') }}</h1>

    <div v-if="loading" class="flex justify-center py-20">
      <BaseSpinner size="lg" />
    </div>

    <div v-else-if="error" class="text-center py-12 text-danger-600 text-sm">
      {{ t('common.loadError') }}: {{ error }}
    </div>

    <template v-else-if="stats">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <BaseCard padding="md">
          <p class="text-xs font-medium text-[var(--text-secondary)]">{{ t('admin.dashboard.totalUsers') }}</p>
          <p class="text-2xl font-bold text-[var(--text-primary)] mt-1">{{ stats.totalUsers }}</p>
        </BaseCard>
        <BaseCard padding="md">
          <p class="text-xs font-medium text-[var(--text-secondary)]">{{ t('admin.dashboard.totalGroups') }}</p>
          <p class="text-2xl font-bold text-[var(--text-primary)] mt-1">{{ stats.totalGroups }}</p>
        </BaseCard>
        <BaseCard padding="md">
          <p class="text-xs font-medium text-[var(--text-secondary)]">{{ t('admin.dashboard.newUsersLast7d') }}</p>
          <p class="text-2xl font-bold text-[var(--text-primary)] mt-1">{{ stats.newUsersLast7d }}</p>
        </BaseCard>
        <BaseCard padding="md">
          <p class="text-xs font-medium text-[var(--text-secondary)]">{{ t('admin.dashboard.newGroupsLast7d') }}</p>
          <p class="text-2xl font-bold text-[var(--text-primary)] mt-1">{{ stats.newGroupsLast7d }}</p>
        </BaseCard>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Recent users -->
        <BaseCard padding="md">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-semibold text-[var(--text-primary)]">{{ t('admin.dashboard.recentUsers') }}</h2>
            <button
              type="button"
              class="text-sm font-medium text-brand-600 hover:text-brand-700"
              @click="router.push('/admin/users')"
            >
              {{ t('admin.dashboard.viewAllUsers') }}
            </button>
          </div>
          <BaseEmptyState
            v-if="stats.recentUsers.length === 0"
            :title="t('admin.users.emptyTitle')"
          />
          <ul v-else class="flex flex-col divide-y divide-[var(--border-default)]">
            <li v-for="user in stats.recentUsers" :key="user.id">
              <button
                type="button"
                class="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-[var(--bg-subtle)] transition-colors -mx-2 px-2 rounded-lg"
                @click="router.push(`/admin/users/${user.id}`)"
              >
                <div class="min-w-0">
                  <p class="text-sm font-medium text-[var(--text-primary)] truncate">{{ user.name }}</p>
                  <p class="text-xs text-[var(--text-tertiary)] truncate">{{ user.email }}</p>
                </div>
                <BaseBadge :variant="user.role === 'admin' ? 'brand' : 'neutral'" size="sm">
                  {{ t(`admin.roles.${user.role}`) }}
                </BaseBadge>
              </button>
            </li>
          </ul>
        </BaseCard>

        <!-- Recent groups -->
        <BaseCard padding="md">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-semibold text-[var(--text-primary)]">{{ t('admin.dashboard.recentGroups') }}</h2>
            <button
              type="button"
              class="text-sm font-medium text-brand-600 hover:text-brand-700"
              @click="router.push('/admin/groups')"
            >
              {{ t('admin.dashboard.viewAllGroups') }}
            </button>
          </div>
          <BaseEmptyState
            v-if="stats.recentGroups.length === 0"
            :title="t('admin.groups.emptyTitle')"
          />
          <ul v-else class="flex flex-col divide-y divide-[var(--border-default)]">
            <li v-for="group in stats.recentGroups" :key="group.id">
              <button
                type="button"
                class="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-[var(--bg-subtle)] transition-colors -mx-2 px-2 rounded-lg"
                @click="router.push(`/admin/groups/${group.id}`)"
              >
                <div class="min-w-0">
                  <p class="text-sm font-medium text-[var(--text-primary)] truncate">{{ group.name }}</p>
                  <p class="text-xs text-[var(--text-tertiary)] truncate">{{ group.initiatorName }}</p>
                </div>
                <span class="shrink-0 text-xs text-[var(--text-tertiary)]">{{ formatDate(group.createdAt) }}</span>
              </button>
            </li>
          </ul>
        </BaseCard>
      </div>
    </template>
  </div>
</template>
