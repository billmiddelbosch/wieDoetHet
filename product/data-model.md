# Data Model — wieDoetHet

**Last Updated:** 2026-08-20 (added `User.role`, Admin read models)

---

## Core Entities

### User
```js
{
  id: string,           // UUID
  email: string,
  name: string,
  avatarUrl: string | null,
  role: 'admin' | 'user',  // default 'user' — gates access to the Admin Section. First
                            // admin is granted by manually editing the DynamoDB item;
                            // no self-serve promotion in v1. See product/specs/admin-api.spec.md
  createdAt: string,    // ISO 8601
}
```

### AnonymousUser (localStorage only)
```js
{
  name: string,         // User-provided name at claim time
  sessionId: string,    // UUID generated client-side, stored in localStorage
}
```

### Group
```js
{
  id: string,                   // UUID
  shareToken: string,           // Short unique token for share URL
  name: string,
  pictureUrl: string | null,
  initiatorId: string,          // User.id
  isTemporary: boolean,         // Auto-expire after event date
  eventDate: string | null,     // ISO 8601
  requireClaimOne: boolean,     // Must members claim at least one task?
  scorecardVisibility: 'all' | 'selected' | 'initiator',
  scorecardVisibleTo: string[], // User.id[] when visibility = 'selected'
  createdAt: string,
  updatedAt: string,
}
```

### Task
```js
{
  id: string,           // UUID
  groupId: string,      // Group.id
  title: string,
  description: string | null,
  maxCapacity: number | null,   // null = unlimited
  order: number,                // Sort order
  createdAt: string,
  updatedAt: string,
}
```

### Claim
```js
{
  id: string,           // UUID
  taskId: string,       // Task.id
  groupId: string,      // Group.id
  userId: string | null,        // null for anonymous
  anonymousName: string | null, // set when userId is null
  sessionId: string | null,     // AnonymousUser.sessionId
  claimedAt: string,
}
```

---

## Derived / View Models

### TaskWithClaims
```js
{
  ...Task,
  claims: Claim[],
  claimCount: number,
  isFull: boolean,            // claimCount >= maxCapacity (when maxCapacity set)
  isClaimedByMe: boolean,     // current user or session has a claim
}
```

### GroupWithTasks
```js
{
  ...Group,
  tasks: TaskWithClaims[],
  totalClaimed: number,
  totalTasks: number,
  initiatorName: string,
}
```

### ScorecardRow
```js
{
  participantName: string,
  participantId: string | null, // null for anonymous
  tasks: { taskId: string, taskTitle: string }[],
}
```

---

## Admin Read Models

Read-only shapes returned by the Admin Section API (`/admin/*`, see `product/specs/admin-api.spec.md`). None of these are persisted entities — they're computed/enriched at request time from the `User` and `Group` entities above.

### AdminUserSummary
Row shape for the paginated `/admin/users` list.
```js
{
  id: string,
  email: string,
  name: string,
  role: 'admin' | 'user',
  createdAt: string,       // signup date, ISO 8601
  groupCount: number,      // groups this user initiated
  lastActivityAt: string,  // max(createdAt, most recent initiated group's createdAt).
                            // Best-effort — does NOT include task-claiming activity,
                            // since claims aren't indexed by user. See spec's Known Limitations.
}
```

### AdminUserDetail
Returned by `GET /admin/users/:id`. Extends `AdminUserSummary` with the groups this user initiated.
```js
{
  ...AdminUserSummary,
  groups: { id: string, name: string, shareToken: string, createdAt: string }[],
}
```

### AdminGroupSummary
Row shape for the paginated `/admin/groups` list.
```js
{
  id: string,
  name: string,
  pictureUrl: string | null,
  initiatorId: string,
  initiatorName: string,   // enriched via batch user lookup
  initiatorEmail: string,  // enriched via batch user lookup
  taskCount: number,       // same rollup formula as wiedoethet-groups' enrichGroup()
  memberCount: number,     // unique claimers, same rollup formula as enrichGroup()
  createdAt: string,
}
```

### AdminGroupDetail
Returned by `GET /admin/groups/:id`. Extends `AdminGroupSummary` with the group's tasks and per-task claim counts.
```js
{
  ...AdminGroupSummary,
  tasks: { id: string, title: string, order: number, claimCount: number }[],
}
```

### AdminStats
Returned by `GET /admin/stats`.
```js
{
  totalUsers: number,        // COUNT query against GSI3 (GSI3PK='USER')
  totalGroups: number,       // COUNT query against GSI3 (GSI3PK='GROUP')
  newUsersLast7d: number,    // GSI3 range query, GSI3SK >= now-7d
  newGroupsLast7d: number,   // GSI3 range query, GSI3SK >= now-7d
  recentUsers: AdminUserSummary[],   // most recent 5 by createdAt
  recentGroups: AdminGroupSummary[], // most recent 5 by createdAt
  generatedAt: string,       // ISO 8601, when this snapshot was computed
}
```
**Note:** `totalTasks`/`totalClaims` are intentionally NOT included in v1 — Tasks and Claims have no GSI3 partition, so counting them would require a full-table `Scan`, which GSI3 exists specifically to avoid. Adding them later would need a dedicated index or a streaming counter, not a v1 concern.

---

## API Endpoint Map (consumed by Vue frontend via Axios)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | None | Register new user |
| POST | `/auth/login` | None | Login, returns JWT |
| POST | `/auth/logout` | JWT | Logout |
| GET | `/auth/me` | JWT | Get current user |
| GET | `/groups` | JWT | List my groups |
| POST | `/groups` | JWT | Create group |
| GET | `/groups/:id` | Optional | Get group by ID |
| GET | `/groups/share/:token` | None | Resolve share token |
| PATCH | `/groups/:id` | JWT | Update group |
| DELETE | `/groups/:id` | JWT | Delete group |
| GET | `/groups/:id/tasks` | Optional | List tasks in group |
| POST | `/groups/:id/tasks` | JWT | Create task |
| PATCH | `/groups/:id/tasks/:tid` | JWT | Update task |
| DELETE | `/groups/:id/tasks/:tid` | JWT | Delete task |
| GET | `/groups/:id/claims` | Optional | Get scorecard |
| POST | `/groups/:id/tasks/:tid/claim` | Optional | Claim task |
| DELETE | `/groups/:id/tasks/:tid/claim` | Optional | Unclaim task |
| GET | `/admin/stats` | JWT (admin) | Platform-wide counts and recent activity |
| GET | `/admin/users` | JWT (admin) | Paginated/searchable user list |
| GET | `/admin/users/:id` | JWT (admin) | User detail |
| GET | `/admin/groups` | JWT (admin) | Paginated/searchable group list |
| GET | `/admin/groups/:id` | JWT (admin) | Group detail |

"JWT (admin)" = valid JWT required, AND the token's `sub` must resolve to a `User` with `role === 'admin'` (re-checked server-side on every request — the JWT itself carries no role claim).
