# Spec — Groups

**Last Updated:** 2026-03-03

---

## Purpose
Groups are the primary container for tasks. An initiator creates a group, configures it, and shares the link with members.

## Routes
- `/dashboard` — GroupListView: all groups for authenticated initiator
- `/groups/new` — GroupCreateView: create group form
- `/groups/:id` — GroupDetailView: task list + claim interface (public via share token)
- `/groups/:id/settings` — GroupSettingsView: edit group settings (initiator only)
- `/g/:shareToken` — ShareRedirectView: resolves token → redirects to `/groups/:id`

## Composable: useGroups
```js
// src/composables/useGroups.js
{
  groups: Ref<Group[]>,
  currentGroup: Ref<Group | null>,
  loading: Ref<boolean>,
  error: Ref<string | null>,
  fetchGroups(): Promise<void>,
  fetchGroup(id): Promise<void>,
  fetchGroupByShareToken(token): Promise<void>,
  createGroup(payload): Promise<Group>,
  updateGroup(id, payload): Promise<void>,
  deleteGroup(id): Promise<void>,
}
```

## Store: useGroupStore
```js
// src/stores/group.js
{
  groups: Group[],
  currentGroup: Group | null,
  // Actions
  setGroups(groups),
  setCurrentGroup(group),
  addGroup(group),
  updateGroup(id, data),
  removeGroup(id),
}
```

## Views

### GroupListView (Dashboard)
- Atomic Level: Page
- Shows a grid of GroupCard components
- Empty state: "Je hebt nog geen groepen. Maak je eerste groep aan!"
- FAB / button: "Nieuwe groep"
- Auth required

### GroupCreateView
- Atomic Level: Page
- Form fields:
  - Naam (required)
  - Afbeelding (optional, file upload)
  - Is tijdelijk? (toggle) → shows date picker if yes
  - Moeten leden minimaal één taak kiezen? (toggle)
  - Scorecard zichtbaar voor: radio (Iedereen / Geselecteerde leden / Alleen ik)
- On submit: `createGroup()` → navigate to `/groups/:id`
- Auth required

### GroupDetailView
- Atomic Level: Page
- Public (accessible via share link, no auth required)
- Shows: group name, picture, task list with claim buttons
- Anonymous users see name prompt before first claim
- Initiator sees additional controls (add task, edit group link)
- Shows WhatsApp share button

### GroupSettingsView
- Atomic Level: Page
- Same fields as GroupCreateView, pre-filled
- Danger zone: delete group
- Auth + initiator required

### ShareRedirectView
- Atomic Level: Page
- On mount: fetches group by `shareToken`, redirects to `/groups/:id`
- Shows loading spinner while resolving

## Component Contracts

### GroupCard [MOLECULE]
Props:
- `group: Group` (required)
Emits:
- `click` — user clicks the card

### GroupHeader [ORGANISM]
Props:
- `group: Group` (required)
- `isInitiator: boolean` (default: false)
Emits:
- `share` — share button clicked
- `settings` — settings icon clicked

### ShareLinkPanel [MOLECULE]
Props:
- `shareUrl: string` (required)
- `groupName: string` (required)
Emits:
- `copied` — link was copied to clipboard
- `whatsapp` — WhatsApp button clicked

## Acceptance Criteria
- [ ] Dashboard shows all groups for logged-in user
- [ ] Group card shows name, picture (or placeholder), task count
- [ ] Create form validates name is non-empty
- [ ] Share token resolves correctly via `/g/:shareToken`
- [ ] Share URL is `<origin>/g/<shareToken>`, copyable
- [ ] WhatsApp button opens `https://wa.me/?text=<encoded message>`
- [ ] Non-initiator cannot access `/groups/:id/settings`
