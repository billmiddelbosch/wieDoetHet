# Spec — Admin Section (Frontend)

**Status:** SPEC/DESIGN/IMPLEMENT/TEST complete for the base read-only section AND the Admin Mail Users
feature (§ Admin Mail Users below), now including Cypress E2E coverage. REVIEW/VALIDATE/COMMIT pending for
Admin Mail Users — see that section's own status line.
**Scope of this file:** frontend only — routes, views, composables, store, navigation guard, new UI primitives, i18n key list. Backend contract (endpoints, request/response shapes, pagination/search params, auth semantics) is `product/specs/admin-api.spec.md` — this spec's API-integration notes cite it, not redefine it. Read models (`AdminUserSummary`, `AdminUserDetail`, `AdminGroupSummary`, `AdminGroupDetail`, `AdminStats`) are defined in `product/data-model.md` § Admin Read Models.
**Last Updated:** 2026-09-15 — added § Admin Mail Users (bulk HTML email to selected/filtered users via SES); corrected the "Strictly v1 read-only" framing below, which Admin Mail Users' `POST /admin/mail` intentionally breaks.

---

## Purpose

Give internal admin-role users a browsing UI over platform users and groups, plus a stats dashboard, without needing AWS Console access for routine questions. The original v1 was strictly read-only (no create/update/delete affordances); the Admin Mail Users feature (below) is a deliberate, narrow exception — it adds one write/side-effecting action (sending email via SES) while leaving every other admin affordance read-only. There is still no create/update/delete of Users or Groups themselves, and no promote-to-admin UI. Access is gated client-side by `authStore.isAdmin` (for UX — hiding nav/redirecting) and enforced server-side by the backend's `requireAdmin` check (the real security boundary; the frontend gate is a UX convenience, not a substitute for it).

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
  usersTotalCount: number,             // (added for Admin Mail Users) total count of users matching the
                                        // current filter, across ALL pages — from /admin/users' totalCount
                                        // field. Powers AdminSelectionToolbar's "select all N matching" UI
                                        // and the selectAllMode `selectedCount` computed in AdminUsersView.
                                        // Not used by anything read-only-only; default 0.
  currentUser: AdminUserDetail | null,
  groups: AdminGroupSummary[],
  groupsNextCursor: string | null,     // from the last /admin/groups response
  currentGroup: AdminGroupDetail | null,

  // Actions — all replace, none append (each page fetch is a full replace of the list)
  setStats(stats),
  setUsers(users, nextCursor, totalCount = 0),   // totalCount param added for Admin Mail Users
  setCurrentUser(user),
  setGroups(groups, nextCursor),
  setCurrentGroup(group),
}
```

**No `addX`/`updateX`/`removeX` actions were added for Admin Mail Users either** — sending mail has no
effect on any admin-store-held entity; the store still only ever replaces list/detail snapshots fetched
from the read endpoints. Selection state and the mail send result live in `AdminUsersView`'s own local
refs (see § Admin Mail Users below), not in this store — they are page-local UI state, not fetched data.

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
  usersTotalCount: Ref<number>,            // (added for Admin Mail Users) total matching the current
                                            // filter across all pages, from the store — see useAdminStore
  currentQuery: Ref<string>,               // (added for Admin Mail Users) the active `q`, exposed read-only
                                            // so AdminUsersView can pass it back verbatim as the `q` in a
                                            // { selectAll: true, q } mail request — never reconstructed
                                            // from the search input directly, to guarantee it matches
                                            // exactly what the last fetch actually used
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
- `BaseInput` search box (debounced ~300ms) bound to local `q`; on change calls `fetchUsers({ q })` (resets to page 1) and, per Admin Mail Users below, also clears any active row selection / select-all-mode — a changed search term invalidates the previous selection immediately rather than leaving it stale.
- `AdminSelectionToolbar` (see § Admin Mail Users) rendered above `BaseTable`, wired to the selection state described below.
- `BaseTable` columns: e-mail, naam, rol (`cell-role` slot → `BaseBadge`), aangemeld (`createdAt`, formatted), groepen (`groupCount`), laatste activiteit (`lastActivityAt`, formatted). Since Admin Mail Users: also passed `selectable`, `:selected-keys="effectiveSelectedKeys"`, `@update:selected-keys="handleSelectionChange"` (see below).
- `@row-click` → `router.push(`/admin/users/${row.id}`)`
- `BasePagination` wired to `useAdminUsers`'s `hasNext`/`hasPrevious`/`fetchNextPage`/`fetchPreviousPage`
- Loading/error/empty states per `DashboardView` convention; empty state uses `admin.users.emptyTitle`/`emptyDesc` (distinguishes "no users at all" is not realistic post-launch, but "no results for this search" is — same empty state copy covers both, phrased generically)
- `useHead`, i18n: `admin.users.*`, `seo.adminUsers.*`, `admin.mail.*` (see below)

**Selection state added for Admin Mail Users** (local to this view, not the store — see § New Store above):
```js
const selectedIds = ref(new Set())      // explicit row selection, persists across pagination within a session
const selectAllMode = ref(false)        // mutually exclusive with selectedIds — true means "every user
                                         // matching currentQuery.value, resolved server-side on send"
const effectiveSelectedKeys = computed(() =>
  selectAllMode.value ? users.value.map(u => u.id) : [...selectedIds.value]
)                                        // what BaseTable actually renders as checked — in selectAllMode
                                         // this only reflects the CURRENT page's rows as checked, since
                                         // BaseTable has no concept of rows it isn't rendering
const selectedCount = computed(() =>
  selectAllMode.value ? usersTotalCount.value : selectedIds.value.size
)
```
- Manually toggling any checkbox (`handleSelectionChange`) unconditionally sets `selectAllMode.value = false` — exiting select-all-mode is implicit, not a separate action, so there's no way to end up with both a stale "all N" claim and a manually-edited subset.
- Changing the search query resets both `selectedIds` and `selectAllMode` (see above) — the staleness guard called for in `admin-api.spec.md`'s `POST /admin/mail`, enforced on the frontend as defense-in-depth even though the backend re-validates the filter itself.

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

## Admin Mail Users

**Status: SPEC/DESIGN/IMPLEMENT/TEST complete. REVIEW/VALIDATE/COMMIT pending.**
Branch: `feature/admin-mail-users`.

Lets an admin compose a rich-text (HTML) email and send it, server-side via AWS SES through the
`wiedoethet-admin` Lambda, to a bulk-selected set of users chosen from `AdminUsersView`'s existing table —
either an explicit checkbox selection or "select all N matching the current filter" (server re-resolved,
never a client-supplied ID list — see `admin-api.spec.md`'s `POST /admin/mail`). Not a `mailto:` link. No
CC, no saved templates in v1 — explicit, final scope decisions carried into this run.

### Composable: useAdminMail

```js
// src/composables/useAdminMail.js
{
  loading: Ref<boolean>,
  error: Ref<string | null>,
  sendMail({ userIds, selectAll, q, subject, html }): Promise<AdminMailResult | null>,
    // POST /admin/mail
    // selectAll truthy  -> body { selectAll: true, q, subject, html }   (userIds, if passed, is IGNORED —
    //                       enforced in the composable itself so a caller mistake can never leak a client
    //                       list into a selectAll request)
    // selectAll falsy   -> body { userIds, subject, html }
    // Returns the aggregate { sent, failed, failures } on 200, or null with `error` set on request failure
    // (network error, 400/401/403) — same loading/error convention as every other admin composable.
}
```
`AdminMailResult` is defined in `product/data-model.md` § Admin Read Models (added alongside this feature).

### Molecule: AdminSelectionToolbar

`src/components/molecules/AdminSelectionToolbar.vue` — **Atomic Level: Molecule**
```
Props:
  selectedCount: number   (required)
  totalCount: number      (required)
  disabled: boolean        (default: false)   — true while a send is in flight; disables Clear/Send
Emits:
  select-all-matching
  clear
  send-email
Slots: none
```
- Renders nothing (`v-if="selectedCount > 0"`) until at least one row is selected — stays out of the way
  of the read-only browsing flow otherwise.
- The "select all N matching" link/button is itself conditional on `selectedCount < totalCount` — once
  every matching row is already selected (by any means), the link has nothing left to offer and disappears.
- Composes only `BaseButton` (atom) + `useI18n` — no store/composable imports, consistent with the
  molecule tier's role of composing atoms with light presentational logic, no data fetching.
- Atomic Rationale: a Molecule, not an Atom, because it combines multiple atoms (two `BaseButton`s plus a
  bare toggle-link) into one semantically-specific unit ("bulk selection toolbar") that only makes sense in
  this admin-list context — unlike `BaseTable`/`BasePagination`, it is not reusable as a generic primitive.

### Organism: AdminMailComposeModal

`src/components/organisms/AdminMailComposeModal.vue` — **Atomic Level: Organism**
```
Props:
  open: boolean                 (required)
  recipientCount: number        (required)  — rendered as "This message will be sent to N recipient(s)."
  loading: boolean              (default: false)
  result: { sent, failed, failures } | null   (default: null)  — last send's aggregate result
  error: string | null          (default: null)                — request-level failure message
Emits:
  send({ subject: string, html: string })   — subject trimmed, html raw from BaseRichTextEditor
  close
Slots: none
```
- Composes `BaseModal`, `BaseInput` (subject), `BaseRichTextEditor` (body), `BaseButton` ×2, `BaseAlert`
  (error, or result summary once the send completes — success/warning variant depending on `failed > 0`).
- Local validation before emitting `send`: subject non-empty (trimmed), body non-empty and not just an
  empty Tiptap paragraph (`'<p></p>'`) — i18n'd inline errors (`admin.mail.subjectRequired`/`bodyRequired`),
  no network round-trip needed to catch these.
- Resets `subject`/`html`/`errors` whenever `open` transitions to `true` — reopening for a second send
  always starts from a blank compose box, it never carries over the previous message.
- Atomic Rationale: Organism, not Molecule, because it composes multiple Molecules-and-Atoms-level pieces
  (a full form inside a modal shell) into one self-contained feature unit with its own validation and
  submit lifecycle — the same tier `GroupCreateModal`-style organisms already occupy in this codebase.

### AdminUsersView changes

See § AdminUsersView above (Views section) for the selection-state additions. In addition, `AdminUsersView`
owns the send flow itself:
```js
async function handleComposeSend({ subject, html }) {
  const payload = selectAllMode.value
    ? { selectAll: true, q: currentQuery.value, subject, html }
    : { userIds: [...selectedIds.value], subject, html }
  const result = await sendMail(payload)
  mailResult.value = result
  if (result) { selectAllMode.value = false; selectedIds.value = new Set() }  // clear selection on success
}
```
`currentQuery.value` (from `useAdminUsers`, see above) is passed verbatim — never re-read from the raw
search `<BaseInput>` — so the `q` sent to the server always matches the filter that produced the currently
displayed `usersTotalCount`.

### Judgment calls made during IMPLEMENT (flagged for REVIEW)

- **`BaseRichTextEditor` + Tiptap dependency** — the brief called for "rich text/HTML body," not a specific
  library. Tiptap (`@tiptap/vue-3`, `@tiptap/starter-kit`, `@tiptap/pm`, `@tiptap/extension-placeholder`)
  was chosen as a well-maintained, Vue-3-native, headless rich-text editor with a manageable bundle size
  versus alternatives (Quill, TinyMCE) that either bring their own CSS framework or are jQuery-era. This is
  a new production dependency — flag for explicit sign-off.
- **`selectAllMode` boolean flag vs. a literal resolved-IDs array** — chosen because the backend contract
  supports two distinct request shapes (`{userIds}` vs `{selectAll, q}`) and this avoids ever materializing
  all N ids client-side (could be hundreds, per `MAX_MAIL_RECIPIENTS`). See `admin-api.spec.md`.
- **`usersTotalCount` added to the store/composable/backend response** — not originally in the read-only
  spec; required to render "select all N matching" and to size the selectAllMode `selectedCount`. Costs one
  extra bounded internal-loop count query per `/admin/users` request (see `admin-api.spec.md` § `countAllMatchingUsers`) — accepted as a deliberate scope addition for this feature, not silently absorbed.
- **`MAX_MAIL_RECIPIENTS = 500` per send** — a safety cap invented for this feature (backend), not specified
  in the original brief; flagged for explicit approval since it is a real product-behavior limit (a send
  targeting more than 500 matching users is rejected with `400`, not silently truncated).

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

admin.mail.selectedCount               // AdminSelectionToolbar ("{count} geselecteerd")
admin.mail.selectAllMatching           // ("Alle {count} resultaten selecteren")
admin.mail.clearSelection               // ("Selectie wissen")
admin.mail.sendEmail                    // ("E-mail versturen")
admin.mail.composeTitle                 // AdminMailComposeModal title ("E-mail opstellen")
admin.mail.recipientSummary             // ("Dit bericht wordt verstuurd naar {count} ontvanger(s).")
admin.mail.subjectLabel                 // ("Onderwerp")
admin.mail.subjectPlaceholder           // ("Onderwerp van de e-mail")
admin.mail.subjectRequired              // ("Onderwerp is verplicht.")
admin.mail.bodyLabel                    // ("Bericht")
admin.mail.bodyPlaceholder              // ("Schrijf hier je bericht...")
admin.mail.bodyRequired                 // ("Bericht is verplicht.")
admin.mail.sendCta                      // ("Versturen")
admin.mail.resultSummary                // ("{sent} verstuurd, {failed} mislukt.")

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

### Admin Mail Users — additional Acceptance Criteria

- [ ] Checking rows in `AdminUsersView`'s table shows `AdminSelectionToolbar` with the correct selected count; unchecking the last row hides it again
- [ ] "Select all N matching" resolves to the current search filter server-side, not a client-side snapshot of ids — verified via `useAdminMail.test.js`'s explicit assertion that a `selectAll` send never includes a `userIds` array, even when one is passed in
- [ ] Changing the search box clears any active selection and exits select-all-mode (staleness guard)
- [x] While select-all-mode is active, `BaseTable`'s header and row checkboxes render disabled
  (`selection-disabled` prop) rather than being toggleable — fixes a data-safety bug found in code review
  where unchecking a single row while in select-all mode silently collapsed "all N matching" down to "this
  page minus one," with no warning to the admin. To select a different set, the admin must use "Clear
  selection" first (exits select-all-mode), then check rows manually.
- [ ] Compose modal blocks submission with inline errors when subject or body is empty; does not call `sendMail`
- [ ] Successful send clears the selection and shows the aggregate `{sent, failed}` result, with per-recipient failure detail when `failed > 0`
- [ ] A request-level failure (network/4xx) shows `error`, not a silent no-op
- [ ] `BaseTable`'s selection column and `BaseRichTextEditor` have zero imports from `src/stores/`, `src/composables/`, or `@/lib/` (Atom purity maintained)
- [ ] All `admin.mail.*` keys present in both `nl.json` and `en.json`
- [ ] Unit/component tests exist and pass for: `BaseTable` selection behavior, `BaseRichTextEditor`, `AdminSelectionToolbar`, `AdminMailComposeModal`, `useAdminMail` (118/118 tests passing across 15 files as of this Last Updated date)
- [x] Cypress E2E coverage exists and passes for the selection + mail-send flow in `cypress/e2e/admin.cy.js`'s `user selection and mail sending` describe block: toolbar show/hide on check/uncheck, "select all N matching" resolving the full total, checkboxes disabled during select-all-mode (regression test for the collapse bug below), selection clearing on query change, sending to explicitly-checked recipients, sending with `selectAll:true`, empty subject/body validation blocking the send, partial-failure result summary, and request-level failure surfacing (9 new tests; 21/21 total passing in `admin.cy.js` as of this Last Updated date)

**Known issue, flagged for follow-up (not fixed here — policy decision, not a bug):** `POST /admin/mail` has a
per-call cap (`MAX_MAIL_RECIPIENTS`) but no per-admin/day send cooldown or quota, so a valid admin session
could call it repeatedly with no throttling. Deliberately left unimplemented pending a product decision on
an acceptable cooldown/quota; tracked in `product/backlog.md`.

**Last Updated:** 2026-09-15 — added Admin Mail Users feature (see § Admin Mail Users), including the Cypress E2E suite for the selection + mail-send flow (`cypress/e2e/admin.cy.js`, 21/21 passing); fixed a code-review-found data-safety bug where unchecking one row during "select all N matching" silently shrank the send to a page-scoped subset (see `BaseTable`'s new `selectionDisabled` prop in `components-ui.spec.md`); logged the missing send-cooldown/quota as a flagged backlog follow-up rather than guessing at a number. Original 2026-08-20 read-only-section content otherwise unchanged.
