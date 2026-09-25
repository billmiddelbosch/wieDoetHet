# Data Model — wieDoetHet

**Last Updated:** 2026-09-19 (mail automation, spec-first: `User.mailOptOut*`/`lastSeenAt`, `MailTemplateConfig`,
`MailLogEntry`, `MailLastRun`, `AdminUserSummary`/`Detail` fields, `AdminMailResult.skippedOptOut` and five new
`/admin/*` endpoints — see `product/specs/mail-automation-api.spec.md` and `product/specs/mail-automation.spec.md`;
built on branch `feature/mailAutomation` (2026-09-20). Prior 2026-09-15 entry: added `AdminMailRequest`/`AdminMailResult` and `totalCount` on the
`/admin/users` endpoint map row, for the Admin Mail Users feature. 2026-08-20: added `User.role`, Admin read models.)

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
  mailOptOut: boolean,          // absent ⇒ false. true ⇒ no lifecycle mails AND skipped by the manual admin
                                 // mailing. Set only by an admin (PATCH /admin/users/:id/mail-opt-out) after the
                                 // user asked by replying to a mail; there is no self-serve link in v1.
  mailOptOutAt: string | null,  // ISO 8601, set when mailOptOut flips to true, null when it flips back
  mailOptOutBy: string | null,  // id of the admin who last changed the flag
  lastSeenAt: string | null,    // ISO 8601, last product use. Touched at most once per 24 h from login,
                                 // GET /auth/me and GET /groups. Feeds the dormant_30/dormant_60 lifecycle mails.
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
  mailOptOut: boolean,     // absent attribute ⇒ false. Drives the "Afgemeld" badge in the users list.
}
```

### AdminUserDetail
Returned by `GET /admin/users/:id`. Extends `AdminUserSummary` with the groups this user initiated.
```js
{
  ...AdminUserSummary,
  groups: { id: string, name: string, shareToken: string, createdAt: string }[],
  mailOptOutAt: string | null,  // when the opt-out was set; null when subscribed
  lastSeenAt: string | null,    // last product use (see User.lastSeenAt); null if never touched yet
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

### AdminMailRequest
Request body for `POST /admin/mail` (Admin Mail Users feature). `userIds` and `selectAll`/`q` are mutually
exclusive in practice — when `selectAll` is `true`, any `userIds` present is ignored server-side, never merged
in. See `product/specs/admin-api.spec.md` § POST /admin/mail for the full validation/resolution behavior.
```js
{
  subject: string,           // non-empty after trim, else 400
  html: string,               // non-empty after trim, else 400 — rich-text HTML from BaseRichTextEditor (Tiptap)
  selectAll: boolean | undefined,  // default false
  q: string | undefined,           // only consulted when selectAll is true — re-run server-side, not cached
  userIds: string[] | undefined,   // required (non-empty after dedup) when selectAll is not true; ignored when it is
}
```

### AdminMailResult
Response body for `POST /admin/mail`. Always `200` once validation/recipient-count checks pass — per-recipient
send failures are reported here, not as a request-level error.
```js
{
  sent: number,                // count of recipients whose SendEmailCommand succeeded
  failed: number,               // count of recipients whose SendEmailCommand threw
  failures: {                   // one entry per failed recipient, empty array when failed === 0
    userId: string,
    email: string,
    message: string,            // caught error message, for admin-facing display
  }[],
  skippedOptOut: number,        // recipients removed because User.mailOptOut === true (0 when none). They are
                                 // dropped after recipient resolution and before the MAX_MAIL_RECIPIENTS check;
                                 // if everyone opted out the response is still 200 { sent: 0, failed: 0, ... }.
}
```

---

## Mail Automation Entities

Persisted in the single `wdh-main` table (no new table, no new GSI) and read/written by the `wiedoethet-lifecycle`
Lambda and the admin Lambda. See `product/specs/mail-automation-api.spec.md` § DynamoDB Integration.

### MailTemplateConfig
Per-template admin configuration. Key: `PK = MAILTPL#{templateId}`, `SK = CONFIG`. **Absent item ⇒ template is
disabled and uses the default text** (the default subject/body and the trigger rules live in code, not in the table).
Template ids (v1): `welcome`, `no_group`, `no_tasks`, `no_claims`, `day_after_event`, `dormant_30`, `dormant_60`.
```js
{
  enabled: boolean,
  subject: string | null,     // override; null ⇒ use the default subject
  bodyHtml: string | null,    // override; null ⇒ use the default body
  enabledAt: string | null,   // ISO 8601, set on every false → true flip; floors the dormant_* trigger so that
                               // enabling the template never mails long-dormant legacy users retroactively
  updatedAt: string,
  updatedBy: string,          // admin user id
}
```
Body/subject may only contain the placeholders allowed for that template (`{{firstName}}`, `{{appUrl}}`,
`{{createGroupUrl}}`, plus `{{groupName}}`/`{{groupUrl}}` for group-scoped templates); unknown tokens are rejected
with a 400 on save. Not in GSI3.

### MailLogEntry
One item per attempted lifecycle mail. The deterministic key doubles as the exactly-once lock (conditional put with
`attribute_not_exists`). Key: `PK = USER#{userId}`, `SK = MAIL#{templateId}#{scopeId}` (`scopeId` = groupId for
group-scoped templates, `-` for user-scoped). Listed in GSI3 under the constant partition `MAILLOG`
(`GSI3SK = {createdAt}#{userId}#{templateId}`). The rendered body is deliberately not stored.
```js
{
  id: string,                 // `${templateId}:${userId}:${scopeId}`
  templateId: string,
  userId: string,
  email: string,              // snapshot at send time
  userName: string,           // snapshot at send time
  groupId: string | null,
  groupName: string | null,
  subject: string,            // the rendered subject actually sent
  status: 'sending' | 'sent' | 'failed',
  attempts: number,           // max 3; a row stuck in 'sending' is never retried (at-most-once)
  errorMessage: string | null,
  sesMessageId: string | null,
  createdAt: string,
  sentAt: string | null,
}
```
Returned as-is by `GET /admin/mail-log` (minus the DynamoDB key attributes).

### MailMaster
Single item: `PK = MAILSTATE#lifecycle`, `SK = MASTER`. The lifecycle-mail master switch, per table (`wdh-dev` and
`wdh-main` are independent). Returned as `master` by `GET /admin/mail-templates` and by
`PATCH /admin/mail-master`. **An absent item means: off** — nothing is sent until an admin turns it on. It is a
separate item from `LASTRUN` so the run's own write can never overwrite it.
```js
{
  enabled: boolean,
  updatedAt: string | null,   // ISO 8601; null when never set
  updatedBy: string | null,   // admin user id; null when never set
}
```

### MailLastRun
Single item, overwritten every run: `PK = MAILSTATE#lifecycle`, `SK = LASTRUN`. Returned as `lastRun` by
`GET /admin/mail-templates`; `null` when the function has never run.
```js
{
  at: string,               // ISO 8601
  masterEnabled: boolean,   // effective at run time: MailMaster.enabled && !killSwitch
  killSwitch: boolean,      // LIFECYCLE_MAIL_ENABLED === 'false' on the Lambda (forces masterEnabled off)
  dryRun: boolean,
  evaluated: number,        // candidates evaluated
  sent: number,
  failed: number,
  skippedByCap: number,     // over LIFECYCLE_MAX_SENDS_PER_RUN, wait for the next slot
}
```

### AdminMailTemplate (read model)
Item of `GET /admin/mail-templates` `items[]` (and the response of `PATCH /admin/mail-templates/:id`). Built from the
code definition merged with the `MailTemplateConfig` item. Name/description/trigger copy is i18n on the frontend.
```js
{
  id: string,
  scope: 'user' | 'group',
  tier: 'immediate' | 'timely' | 'normal',   // immediate = any time (welcome), timely = Mon–Fri 10:00, normal = Tue–Thu 10:00 (Europe/Amsterdam)
  enabled: boolean,
  subject: string,             // effective (override ?? default)
  bodyHtml: string,            // effective (override ?? default)
  defaultSubject: string,
  defaultBodyHtml: string,
  isCustomised: boolean,       // an override is stored
  variables: string[],         // allowed placeholders for this template
  updatedAt: string | null,
  updatedBy: string | null,
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
| GET | `/admin/stats` | JWT (admin) | Platform-wide counts and recent activity |
| GET | `/admin/users` | JWT (admin) | Paginated/searchable user list — response also includes `totalCount` (matches of current `q`, independent of page `limit`), added for the Admin Mail Users "select all N matching" flow |
| GET | `/admin/users/:id` | JWT (admin) | User detail |
| GET | `/admin/groups` | JWT (admin) | Paginated/searchable group list |
| GET | `/admin/groups/:id` | JWT (admin) | Group detail |
| POST | `/admin/mail` | JWT (admin) | Send a rich-text HTML email via SES to explicit `userIds` or every user matching `q` (`selectAll: true`) — see `AdminMailRequest`/`AdminMailResult` above. Opted-out users are skipped and counted in `skippedOptOut` |
| GET | `/admin/mail-templates` | JWT (admin) | The 7 lifecycle mail templates (priority order) + `lastRun` — see `AdminMailTemplate`/`MailLastRun` |
| PATCH | `/admin/mail-templates/:id` | JWT (admin) | Partial update `{ enabled?, subject?, bodyHtml? }`; `null` subject/bodyHtml reverts to the default text. 400 on unknown placeholders |
| POST | `/admin/mail-templates/:id/test` | JWT (admin) | Send the template (sample values, `[TEST]` subject prefix) to the calling admin only; not logged |
| GET | `/admin/mail-log` | JWT (admin) | Newest-first, cursor-paginated lifecycle mail log; filters `templateId`, `status`, `q` (email substring), `limit`, `cursor` — see `MailLogEntry` |
| PATCH | `/admin/users/:id/mail-opt-out` | JWT (admin) | `{ optOut: boolean }` → `{ id, mailOptOut, mailOptOutAt }`; sets/clears the opt-out flag on a user |

"JWT (admin)" = valid JWT required, AND the token's `sub` must resolve to a `User` with `role === 'admin'` (re-checked server-side on every request — the JWT itself carries no role claim).
