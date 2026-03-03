# Data Model — wieDoetHet

**Last Updated:** 2026-03-03

---

## Core Entities

### User
```js
{
  id: string,           // UUID
  email: string,
  name: string,
  avatarUrl: string | null,
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
