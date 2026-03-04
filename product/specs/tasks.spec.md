# Spec — Tasks & Claims

**Last Updated:** 2026-03-03

---

## Purpose
Tasks live within a group. Members claim tasks; initiator manages them.

## Composable: useTasks
```js
// src/composables/useTasks.js
{
  tasks: Ref<TaskWithClaims[]>,
  loading: Ref<boolean>,
  error: Ref<string | null>,
  fetchTasks(groupId): Promise<void>,
  createTask(groupId, payload): Promise<Task>,
  updateTask(groupId, taskId, payload): Promise<void>,
  deleteTask(groupId, taskId): Promise<void>,
}
```

## Composable: useClaims
```js
// src/composables/useClaims.js
{
  claimTask(groupId, taskId, anonymousName?): Promise<void>,
  unclaimTask(groupId, taskId): Promise<void>,
  fetchClaims(groupId): Promise<ScorecardRow[]>,
  scorecard: Ref<ScorecardRow[]>,
}
```

## Store: useTaskStore
```js
// src/stores/task.js
{
  tasks: TaskWithClaims[],
  // Actions
  setTasks(tasks),
  addTask(task),
  updateTask(id, data),
  removeTask(id),
  applyClaim(taskId, claim),
  removeClaim(taskId, claimId),
}
```

## Components

### TaskList [ORGANISM]
Props:
- `tasks: TaskWithClaims[]` (required)
- `isInitiator: boolean` (default: false)
- `requireClaimOne: boolean` (default: false)
- `groupId: string` (required)
Emits:
- `add-task` — initiator clicks add task button
- `edit-task (task)` — initiator clicks edit
- `delete-task (taskId)` — initiator clicks delete

### TaskCard [MOLECULE]
Props:
- `task: TaskWithClaims` (required)
- `isInitiator: boolean` (default: false)
- `disabled: boolean` (default: false) — true when task is full and not claimed by me
Emits:
- `claim` — user claims the task
- `unclaim` — user unclaims
- `edit` — initiator edit
- `delete` — initiator delete

Visual states:
- **Unclaimed** — neutral, claim button visible
- **Claimed by me** — green highlight, unclaim button visible
- **Partially claimed** — shows "X / Y personen" badge
- **Full** — red/grey, claim button disabled (unless claimed by me)

### TaskFormModal [ORGANISM]
Props:
- `groupId: string` (required)
- `task: Task | null` (null = create mode, Task = edit mode)
- `open: boolean` (required)
Emits:
- `saved (task)` — task was created or updated
- `close`

Fields:
- Titel (required)
- Omschrijving (optional, textarea)
- Max. aantal deelnemers (optional, number input, min 1)

### AnonymousNameModal [MOLECULE]
Props:
- `open: boolean`
Emits:
- `submit (name: string)`
- `close`

Purpose: shown before first claim when user is not authenticated. One-time prompt.

### ClaimButton [ATOM]
Props:
- `claimed: boolean`
- `disabled: boolean`
- `loading: boolean`
Emits:
- `click`

## Task Status Logic
```
isFull = maxCapacity !== null && claimCount >= maxCapacity
isClaimedByMe = claims.some(c => c.userId === currentUser.id || c.sessionId === anonymousSession.sessionId)
canClaim = !isFull || isClaimedByMe
```

## Acceptance Criteria
- [ ] Task list renders all tasks in order field order
- [ ] Claim button updates optimistically and syncs with API
- [ ] Full tasks show correct disabled state
- [ ] Anonymous name modal appears before first claim and stores name
- [ ] Initiator sees add/edit/delete controls; members do not
- [ ] Task form validates title non-empty
- [ ] Deleting a task shows confirmation before proceeding
- [ ] `requireClaimOne` group setting shows warning if user tries to leave without claiming
