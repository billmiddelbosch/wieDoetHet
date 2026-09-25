import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { trackPageView } from '@/lib/analytics'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { 
      path: '/',
      name: 'landing',
      component: () => import('@/views/LandingView.vue'),
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/AboutView.vue'),
    },
    {
      path: '/contact',
      name: 'contact',
      component: () => import('@/views/ContactView.vue'),
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('@/views/PrivacyView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/groups/new',
      name: 'group-create',
      component: () => import('@/views/GroupCreateView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/groups/:id',
      name: 'group-detail',
      component: () => import('@/views/GroupDetailView.vue'),
    },
    {
      path: '/groups/:id/settings',
      name: 'group-settings',
      component: () => import('@/views/GroupSettingsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/groups/:id/scorecard',
      name: 'scorecard',
      component: () => import('@/views/ScorecardView.vue'),
    },
    {
      path: '/g/:shareToken',
      name: 'share-redirect',
      component: () => import('@/views/ShareRedirectView.vue'),
    },
    {
      path: '/admin',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAdmin: true },
      children: [
        { path: '', name: 'admin-dashboard', component: () => import('@/views/AdminDashboardView.vue') },
        { path: 'users', name: 'admin-users', component: () => import('@/views/AdminUsersView.vue') },
        {
          path: 'users/:id',
          name: 'admin-user-detail',
          component: () => import('@/views/AdminUserDetailView.vue'),
        },
        { path: 'groups', name: 'admin-groups', component: () => import('@/views/AdminGroupsView.vue') },
        {
          path: 'groups/:id',
          name: 'admin-group-detail',
          component: () => import('@/views/AdminGroupDetailView.vue'),
        },
        {
          path: 'automation',
          name: 'admin-automation',
          component: () => import('@/views/AdminAutomationView.vue'),
        },
        {
          path: 'automation/log',
          name: 'admin-mail-log',
          component: () => import('@/views/AdminMailLogView.vue'),
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach((to) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresAdmin) {
    if (!authStore.isAuthenticated) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    if (!authStore.isAdmin) {
      return { name: 'dashboard' }
    }
  }

  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return { name: 'dashboard' }
  }
})

router.afterEach((to) => {
  trackPageView(to.fullPath, to.name?.toString())
})

export default router
