# Spec — Admin Section (Frontend)

**Status:** SPEC complete. DESIGN/IMPLEMENT/TEST/REVIEW/VALIDATE/COMMIT not yet started.
**Scope of this file:** frontend only — routes, views, composables, store, navigation guard, new UI primitives, i18n key list. Backend contract (endpoints, request/response shapes, pagination/search params, auth semantics) is `product/specs/admin-api.spec.md` — this spec's API-integration notes cite it, not redefine it. Read models (`AdminUserSummary`, `AdminUserDetail`, `AdminGroupSummary`, `AdminGroupDetail`, `AdminStats`) are defined in `product/data-model.md` § Admin Read Models.
**Last Updated:** 2026-08-20 — initial version.

---

## Purpose

Give internal admin-role users a read-only browsing UI over platform users and groups, plus a stats dashboard, without needing AWS Console access for routine questions. Strictly v1 read-only: no create/update/delete affordances anywhere in this UI. Access is gated client-side by `authStore.isAdmin` (for UX — hiding nav/redirecting) and enforced server-side by the backend's `requireAdmin` check (the real security boundary; the frontend gate is a UX convenience, not a substitute for it).

---

## Open Design Question — Resolved: AdminLayout Mechanism

**Decision: nested Vue Router routes, not a `meta.layout` + `<component :is>` switch in `App.vue`.**

Today `App.vue` unconditionally renders `DefaultLayout`, which has no awareness of the router at all beyond hosting a bare `<RouterView />`. A `meta.layout` switch would require teaching `App.vue` to resolve and dynamically render one of several layout components for *every* route in the app — a change to the root render path that every existing route flows through, for the benefit of five new routes.

Nested routes achieve the same outcome using a mechanism Vue Router already provides for exactly this case, and touch nothing outside `src/router/index.js`:

```js
// src/router/index.js — add as a new top-level entry in the routes array
{
  path: '/admin',
  component: () => import('@/layouts/AdminLayout.vue'),
  meta: { requiresAdmin: true },
  children: [
    { path: '', name: 'admin-dashboard', component: () => import('@/views/AdminDashboardView.vue') },
    { path: 'users', name: 'admin-users', component: () => import('@/views/AdminUsersView.vue') },
    { path: 'users/:id', name: 'admin-user-detail', component: () => import('@/views/AdminUserDetailView.vue') },
    { path: 'groups', name: 'admin-groups', component: () => import('@/views/AdminGroupsView.vue') },
    { path: 'groups/:id', name: 'admin-group-detail', component: () => import('@/views/AdminGroupDetailView.vue') },
  ],
},
```

- `meta.requiresAdmin` is declared **once**, on the parent route only. Vue Router merges `meta` across all matched route records into a single `to.meta` object in the navigation guard, so every child inherits it automatically — no per-child duplication.
- `AdminLayout.vue` renders its own `<RouterView />` for the matched child (dashboard/users/groups/detail), the same parent→child composition `DefaultLayout` already does at the app root, just scoped to `/admin/*`.
- `DefaultLayout` and every existing route are completely untouched.

## AdminLayout — Component Contract

`src/layouts/AdminLayout.vue` — **Atomic Level: Template**

- Composes: `AppHeader` (reused unchanged — already gains a conditional "Admin" link, see Navigation below), a new admin-local sub-nav (`Overzicht` / `Gebruikers` / `Groepen`, `RouterLink`s to `/admin`, `/admin/users`, `/admin/groups`, active-state styled), and `<main><RouterView /></main>`.
- No footer — internal tool, footer is public-site chrome.
- No props, no emits. Reads `authStore` only insofar as `AppHeader` already does; `AdminLayout` itself does not re-check `isAdmin` (the route guard already prevents reaching it).
- Atomic Rationale: a Template composes Organisms/atoms into a page shell but is not itself a routed page — same category as `DefaultLayout`.

---

## Routes

| Path | Name | Component | Meta |
|---|---|---|---|
| `/admin` | `admin-dashboard` | `AdminDashboardView.vue` | *(inherits `requiresAdmin` from parent)* |
| `/admin/users` | `admin-users` | `AdminUsersView.vue` | *(inherits)* |
| `/admin/users/:id` | `admin-user-detail` | `AdminUserDetailView.vue` | *(inherits)* |
| `/admin/groups` | `admin-groups` | `AdminGroupsView.vue` | *(inherits)* |
| `/admin/groups/:id` | `admin-group-detail` | `AdminGroupDetailView.vue` | *(inherits)* |

## Navigation Guards

Extend the existing `router.beforeEach` in `src/router/index.js` — add a `requiresAdmin` branch alongside the existing `requiresAuth`/`guestOnly` checks. `requiresAdmin` is **self-contained**: it performs its own authentication check rather than also setting `requiresAuth: true` on the same route, to avoid two meta flags implying two (redundant, but confusing to read) redirects for the same navigation.

```js
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
```

Exact redirect behavior (as required by this feature):

| Visitor | Hits `/admin/*` | Result |
|---|---|---|
| Unauthenticated | any `/admin/*` route | → `/login?redirect=<attempted path>` (same pattern as existing `requiresAuth` routes, so post-login they land back where they were headed) |
| Authenticated, `role: 'user'` | any `/admin/*` route | → `/dashboard` (silent redirect — there is no 403/"forbidden" page in this app today; introducing one is out of scope for v1, flagged as a possible follow-up) |
| Authenticated, `role: 'admin'` | any `/admin/*` route | Allowed through |

This is a client-side UX gate only. The real authorization boundary is server-side `requireAdmin` (401 vs 403, see `admin-api.spec.md`) — every admin composable must still handle a `403` response defensively (e.g. a stale client-side `isAdmin` state after a role was revoked server-side mid-session), by surfacing the error and not silently retrying.

---

## Store: useAuthStore (extension)

**This is an extension of the existing store, not a new one.** `src/stores/auth.js` gains:

```js
// user shape gains a `role` field (already returned by the backend once
// safeUser() strips only PK/SK/GSI*/passwordHash — role was never stripped)
// user: { id, email, name, avatarUrl, role: 'admin' | 'user', createdAt } | null

const isAdmin = computed(() => user.value?.role === 'admin')

return {
  // ...all existing returns, plus:
  isAdmin,
}
```

No other change. `role` arrives for free once the backend's `safeUser()` update ships (per `admin-api.spec.md`'s Related Changes) — nothing in the frontend needs to request it separately; it rides along on the existing `fetchMe()`/login response.

**Follow-up (not done in this run):** `product/specs/auth.spec.md`'s `useAuthStore` state block must be updated to list `role` on `user` and add the `isAdmin` computed. That file belongs to the Auth feature, not Admin — out of scope here, flagged so it isn't silently forgotten.

---

## New Store: useAdminStore

`src/stores/admin.js` — Pinia setup-store, same `ref` state + `computed` getters + `setX` action shape as `src/stores/group.js`. **No `addX`/`updateX`/`removeX` actions** — v1 is read-only, no client-side mutation of admin data ever occurs, so those verbs don't apply here (deliberate deviation from the `group.js`/`task.js` shape, noted so DESIGN doesn't add dead code).

```js
// src/stores/admin.js
{
  // State
  stats: AdminStats | null,
  users: AdminUserSummary[],
  usersNextCursor: string | null,      // from the last /admin/users response
  currentUser: AdminUserDetail | null,
  groups: AdminGroupSummary[],
  groupsNextCursor: string | null,     // from the last /admin/groups response
  currentGroup: AdminGroupDetail | null,

  // Actions — all replace, none append (each page fetch is a full replace of the list)
  setStats(stats),
  setUsers(users, nextCursor),
  setCurrentUser(user),
  setGroups(groups, nextCursor),
  setCurrentGroup(group),
}
```

---

## Pagination Design Note (applies to both `useAdminUsers` and `useAdminGroups`)

The backend's cursor pagination (`admin-api.spec.md`) is **forward-only**: a page response's `nextCursor` lets you fetch the *next* page, but there is no `previousCursor` — DynamoDB's `LastEvaluatedKey` mechanism doesn't support reverse pagination natively. `BasePagination` needs a working "Vorige" (Previous) button, so the cursor-history stack lives in the **composable**, not the store and not the component:

```
cursorHistory: string[]   // local ref inside useAdminUsers/useAdminGroups, NOT persisted to the store
                           // stack of cursors for pages already visited; empty = on page 1
```

- **Next**: push the cursor just used (or `null` for page 1) onto `cursorHistory`, fetch with `cursor: nextCursor`.
- **Previous**: pop the last entry off `cursorHistory`, re-fetch using the popped value (a `null` pop means "re-fetch page 1").
- **New search** (`q` changes): reset `cursorHistory` to `[]` and fetch page 1 fresh — a filtered query is a different sequence, old cursors don't apply to it.
- `hasNext` = `store.usersNextCursor !== null` (or `groupsNextCursor`). `hasPrevious` = `cursorHistory.length > 0`.

This keeps `BasePagination` a pure presentational atom (see below) — it only ever sees `hasNext`/`hasPrevious`/`loading` booleans and emits `next`/`previous`; it has no idea cursors exist.

---

## Composable: useAdminStats

```js
// src/composables/useAdminStats.js
{
  stats: Ref<AdminStats | null>,
  loading: Ref<boolean>,
  error: Ref<string | null>,
  fetchStats(): Promise<void>,   // GET /admin/stats
}
```

Follows the `useGroups.js` pattern exactly: calls `apiClient` (`@/lib/axios.js`) directly, syncs `useAdminStore` via `storeToRefs` + `setStats`, local `loading`/`error` refs, catch block reads `err?.response?.data?.message ?? err.message`.

## Composable: useAdminUsers

```js
// src/composables/useAdminUsers.js
{
  users: Ref<AdminUserSummary[]>,
  currentUser: Ref<AdminUserDetail | null>,
  loading: Ref<boolean>,
  error: Ref<string | null>,
  hasNext: ComputedRef<boolean>,
  hasPrevious: ComputedRef<boolean>,
  fetchUsers({ q } = {}): Promise<void>,   // GET /admin/users?limit=20&q=... — resets cursor history, fetches page 1
  fetchNextPage(): Promise<void>,          // GET /admin/users?limit=20&cursor=...&q=<current q>
  fetchPreviousPage(): Promise<void>,      // pops cursorHistory, re-fetches
  fetchUser(id): Promise<void>,            // GET /admin/users/:id — 404 -> error set, currentUser left null
}
```

`q` is remembered internally (local ref) across `fetchNextPage`/`fetchPreviousPage` calls so paging doesn't drop an active search term. Query params sent to axios: `{ limit: 20, cursor, q }` — `cursor`/`q` omitted (not sent as empty string) when not applicable, matching `admin-api.spec.md`'s "empty string treated as not provided" note by simply not sending the key.

## Composable: useAdminGroups

```js
// src/composables/useAdminGroups.js
{
  groups: Ref<AdminGroupSummary[]>,
  currentGroup: Ref<AdminGroupDetail | null>,
  loading: Ref<boolean>,
  error: Ref<string | null>,
  hasNext: ComputedRef<boolean>,
  hasPrevious: ComputedRef<boolean>,
  fetchGroups({ q } = {}): Promise<void>,   // GET /admin/groups?limit=20&q=...
  fetchNextPage(): Promise<void>,
  fetchPreviousPage(): Promise<void>,
  fetchGroup(id): Promise<void>,            // GET /admin/groups/:id
}
```

Same shape and pagination mechanics as `useAdminUsers`, mirrored for the groups endpoints.

---

## New UI Primitives

Both live in `src/components/ui/` (Atoms) and, per this project's convention, have **no store, composable, or project-specific imports** — read `BaseCard.vue`/`BaseBadge.vue` before implementing to match the prop-driven-variant + Tailwind-utility-class + CSS-custom-property style exactly.

### BaseTable [ATOM]
```
Props:
  columns: { key: string, label: string, align?: 'left'|'right'|'center' }[]  (required)
  rows: object[]                                                              (required)
  rowKey: string                    (default: 'id')       — property used for :key and row-click payload identity
  loading: boolean                  (default: false)      — shows a centered BaseSpinner in place of rows
  emptyMessage: string              (default: '')          — shown when rows.length === 0 and not loading
Slots:
  cell-<columnKey>  — scoped slot per column, receives { row, value }; falls back to plain `{{ value }}` text if not provided
  empty             — overrides the default empty-message rendering
Emits:
  row-click(row)     — fired on row click; consuming view decides whether/where to navigate
Atomic Rationale: generic tabular-data shell, identical role to BaseCard for card layout — zero
  knowledge of what "users" or "groups" are. Column defs and cell slots carry all domain meaning.
```

### BasePagination [ATOM]
```
Props:
  hasNext: boolean       (required)
  hasPrevious: boolean   (required)
  loading: boolean       (default: false)   — disables both buttons while a fetch is in-flight
Slots: none
Emits:
  next
  previous
Atomic Rationale: two-button prev/next control. Deliberately has no concept of page numbers or total
  count — cursor pagination (see Pagination Design Note above) cannot know the total page count without
  an extra count query, so this component only ever needs to know "can I go further."
```

Reuse (no new components needed for these): `BaseCard` for dashboard stat tiles, `BaseBadge` (`variant="brand"` for `role: 'admin'`, `variant="neutral"` for `role: 'user'`) for role badges, `BaseEmptyState` for empty search results, `BaseSpinner` for loading states, `BaseInput` for the search box (debounced `v-model`), `BaseAvatar` for group picture/initials on `AdminGroupDetailView`.

---

## Views

All five follow `DashboardView.vue`'s fetch-on-mount / loading / error / empty-state / `useHead()` / `useI18n()` conventions. The two detail views additionally follow `GroupDetailView.vue`'s master-detail composition: fetch keyed off `route.params.id` in `onMounted`, re-fetch via a `watch(() => route.params.id, ...)` guard for direct in-place navigation (e.g. clicking from one group's initiator link to a different user).

### AdminDashboardView — **Atomic Level: Page**
- Route: `/admin` (`admin-dashboard`)
- `onMounted(() => fetchStats())` via `useAdminStats`
- Loading: centered `BaseSpinner size="lg"` (matches `DashboardView`)
- Error: `t('common.loadError')` + message (matches `DashboardView`)
- Content: four `BaseCard` stat tiles (`totalUsers`, `totalGroups`, `newUsersLast7d`, `newGroupsLast7d`), then two panels ("Recente gebruikers" / "Recente groepen") each listing up to 5 rows from `recentUsers`/`recentGroups` (name/email + `BaseBadge` role for users, name + initiator for groups), each row linking to its detail view; a "Alle gebruikers bekijken" / "Alle groepen bekijken" link into `/admin/users` / `/admin/groups`. `BaseEmptyState` inside a panel if its array is empty (a fresh install with zero groups, for example).
- `useHead({ title: t('seo.adminDashboard.title'), noindex: true })`
- i18n: `admin.dashboard.*`, `seo.adminDashboard.*`

### AdminUsersView — **Atomic Level: Page**
- Route: `/admin/users` (`admin-users`)
- `BaseInput` search box (debounced ~300ms) bound to local `q`; on change calls `fetchUsers({ q })` (resets to page 1)
- `BaseTable` columns: e-mail, naam, rol (`cell-role` slot → `BaseBadge`), aangemeld (`createdAt`, formatted), groepen (`groupCount`), laatste activiteit (`lastActivityAt`, formatted)
- `@row-click` → `router.push(`/admin/users/${row.id}`)`
- `BasePagination` wired to `useAdminUsers`'s `hasNext`/`hasPrevious`/`fetchNextPage`/`fetchPreviousPage`
- Loading/error/empty states per `DashboardView` convention; empty state uses `admin.users.emptyTitle`/`emptyDesc` (distinguishes "no users at all" is not realistic post-launch, but "no results for this search" is — same empty state copy covers both, phrased generically)
- `useHead`, i18n: `admin.users.*`, `seo.adminUsers.*`

### AdminUserDetailView — **Atomic Level: Page**
- Route: `/admin/users/:id` (`admin-user-detail`)
- `onMounted(() => fetchUser(route.params.id))`, `watch(() => route.params.id, ...)` re-fetch guard (mirrors `GroupDetailView`)
- 404 (endpoint returns `404` per `admin-api.spec.md`): show an error panel with `t('admin.userDetail.notFound')` + a back link to `/admin/users`, same visual treatment as `GroupDetailView`'s `groupError` branch
- Content: user info `BaseCard` (email, name, `BaseBadge` role, `createdAt`, `lastActivityAt`), then a `BaseTable` (or simple list — `groups[]` is typically small) of the user's initiated groups (`id`, `name`, share link built as `<origin>/g/${shareToken}`, `createdAt`), each row linking to `/admin/groups/:id`
- Back link/button to `/admin/users` (`admin.userDetail.back`)
- `useHead`, i18n: `admin.userDetail.*`, `seo.adminUserDetail.*`

### AdminGroupsView — **Atomic Level: Page**
- Route: `/admin/groups` (`admin-groups`)
- Mirrors `AdminUsersView` exactly, for groups: search box (debounced, searches `name`); `BaseTable` columns: naam, organisator (`initiatorName` / `initiatorEmail`), taken (`taskCount`), leden (`memberCount`), aangemaakt (`createdAt`); `@row-click` → `/admin/groups/:id`; `BasePagination` wired to `useAdminGroups`
- `useHead`, i18n: `admin.groups.*`, `seo.adminGroups.*`

### AdminGroupDetailView — **Atomic Level: Page**
- Route: `/admin/groups/:id` (`admin-group-detail`)
- `onMounted`/`watch` fetch guard, same pattern as `AdminUserDetailView`
- 404 → same treatment as `AdminUserDetailView`
- Content: group info `BaseCard` (`BaseAvatar` using `pictureUrl`/`name` fallback, `name`, initiator name/email — linking to `/admin/users/:initiatorId` — `taskCount`, `memberCount`, `createdAt`), then a `BaseTable` of `tasks[]` (`title`, `order`, `claimCount`)
- Back link/button to `/admin/groups` (`admin.groupDetail.back`)
- `useHead`, i18n: `admin.groupDetail.*`, `seo.adminGroupDetail.*`

---

## Navigation

`src/components/organisms/AppHeader.vue` gains one conditional link, visible only when `authStore.isAdmin` is `true`, placed in the authenticated-nav `<template v-if="isAuthenticated">` block (alongside the existing profile avatar / logout button):

```vue
<RouterLink v-if="authStore.isAdmin" to="/admin">
  <BaseButton variant="ghost" size="sm">{{ t('nav.admin') }}</BaseButton>
</RouterLink>
```

This is the only change to `AppHeader.vue`. It does not affect any existing nav item, guest or authenticated.

---

## i18n Key List

New top-level `admin` namespace, plus `admin`-prefixed entries under the existing `seo` namespace — both required in `src/i18n/locales/nl.json` (default) and `src/i18n/locales/en.json` (fallback), added simultaneously per this project's i18n convention. Actual key-writing happens in IMPLEMENT; this is the authoritative key list DESIGN/IMPLEMENT must produce translations for.

```
nav.admin                              // AppHeader link label ("Admin")

admin.subnav.dashboard                 // AdminLayout sub-nav tab ("Overzicht")
admin.subnav.users                     // ("Gebruikers")
admin.subnav.groups                    // ("Groepen")

admin.dashboard.title
admin.dashboard.totalUsers
admin.dashboard.totalGroups
admin.dashboard.newUsersLast7d
admin.dashboard.newGroupsLast7d
admin.dashboard.recentUsers
admin.dashboard.recentGroups
admin.dashboard.viewAllUsers
admin.dashboard.viewAllGroups

admin.users.title
admin.users.searchPlaceholder
admin.users.columnEmail
admin.users.columnName
admin.users.columnRole
admin.users.columnCreatedAt
admin.users.columnGroupCount
admin.users.columnLastActivity
admin.users.emptyTitle
admin.users.emptyDesc

admin.userDetail.back
admin.userDetail.groupsTitle
admin.userDetail.notFound

admin.groups.title
admin.groups.searchPlaceholder
admin.groups.columnName
admin.groups.columnInitiator
admin.groups.columnTaskCount
admin.groups.columnMemberCount
admin.groups.columnCreatedAt
admin.groups.emptyTitle
admin.groups.emptyDesc

admin.groupDetail.back
admin.groupDetail.tasksTitle
admin.groupDetail.notFound

admin.roles.admin                      // BaseBadge label ("Admin")
admin.roles.user                       // ("Gebruiker")

admin.pagination.previous              // BasePagination consumer label ("Vorige")
admin.pagination.next                  // ("Volgende")

seo.adminDashboard.title
seo.adminUsers.title
seo.adminUserDetail.title
seo.adminGroups.title
seo.adminGroupDetail.title
```

All five `seo.admin*` entries are `title`-only (no `description`) — matches the existing `seo.dashboard`/`seo.profile` pattern for authenticated-only, `noindex: true` pages (every admin view calls `useHead({ title: ..., noindex: true })`, so a description serves no SEO purpose).

---

## Follow-ups (explicitly out of scope for this run)

- `product/specs/auth.spec.md` needs its `useAuthStore` section updated to document `role` on `user` and the new `isAdmin` computed — belongs to the Auth feature, not touched here.
- No dedicated "403 Forbidden" page exists; a non-admin hitting `/admin/*` is silently redirected to `/dashboard`. A real forbidden-state page is a reasonable future improvement, not required for v1.
- Editing/deactivating/deleting users or groups, and any promote-to-admin UI, are explicitly out of v1 (see `vision.md`).

---

## Acceptance Criteria

- [ ] `/admin/*` is unreachable (redirects to `/login`) for an unauthenticated visitor, with `?redirect=` pointing back at the attempted path
- [ ] `/admin/*` is unreachable (redirects to `/dashboard`) for an authenticated `role: 'user'` visitor
- [ ] An authenticated `role: 'admin'` visitor can reach all five `/admin/*` routes
- [ ] `authStore.isAdmin` is `true` only when `user.role === 'admin'`, `false` for `null` user or `role: 'user'`
- [ ] The "Admin" link in `AppHeader` renders only when `authStore.isAdmin` is `true`, for both guest and non-admin authenticated states it's absent
- [ ] `AdminDashboardView` renders all six `AdminStats` fields correctly and never attempts to render `totalTasks`/`totalClaims` (not present in the API response)
- [ ] `AdminUsersView` and `AdminGroupsView` both: load page 1 on mount, filter correctly via the search box, page forward via `BasePagination`'s "Volgende", and page backward via "Vorige" without losing the active search term
- [ ] `AdminUserDetailView` and `AdminGroupDetailView` both show a not-found state (not a blank page or console error) when the API returns `404`
- [ ] Clicking a row in either list view navigates to the correct detail route
- [ ] `BaseTable` and `BasePagination` have zero imports from `src/stores/`, `src/composables/`, or `@/lib/` (Atom purity)
- [ ] All user-visible strings on every new view/component go through `useI18n()` — no hardcoded Dutch or English text
- [ ] `nl.json` and `en.json` contain every key listed above in both files

**Last Updated:** 2026-08-20 — initial version.
