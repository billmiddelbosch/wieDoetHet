# DynamoDB Setup — wieDoetHet

## Table

| Setting | Value |
|---|---|
| Table name | `wdh-main` |
| Partition key | `PK` — String |
| Sort key | `SK` — String |
| Billing mode | On-demand (PAY_PER_REQUEST) |

---

## Global Secondary Indexes

### GSI1

| Setting | Value |
|---|---|
| Index name | `GSI1` |
| Partition key | `GSI1PK` — String |
| Sort key | `GSI1SK` — String |
| Projection | All attributes |

### GSI2

| Setting | Value |
|---|---|
| Index name | `GSI2` |
| Partition key | `GSI2PK` — String |
| Sort key | `GSI2SK` — String |
| Projection | All attributes |

### GSI3

| Setting | Value |
|---|---|
| Index name | `GSI3` |
| Partition key | `GSI3PK` — String, constant per entity type: `USER`, `GROUP` or `MAILLOG` |
| Sort key | `GSI3SK` — String, `{createdAt ISO 8601}#{id}` |
| Projection | All attributes |

Added for the Admin Section (`wiedoethet-admin`, see `product/specs/admin-api.spec.md`). Turns "list all users" / "list all groups" into a `Query` (cost proportional to that entity type's item count) instead of a `Scan` (cost proportional to the whole table). Only `User` and `Group` items get a GSI3 partition — Tasks and Claims deliberately do not (see spec's Known Limitations). The lifecycle mail log rows (see [Mail automation items](#mail-automation-items)) use a third partition, `MAILLOG`, so the admin mail log is a `Query` too.

**Backfill note:** only *new* User/Group writes (via `wiedoethet-auth`'s `register()` and `wiedoethet-groups`' `createGroup()`) populate `GSI3PK`/`GSI3SK`. Pre-existing items written before this feature shipped will be absent from GSI3 until a one-time backfill script runs (tracked as backlog item ADM-07; script: `lambda/scripts/backfill-gsi3.js`). **Run the backfill before enabling any lifecycle mail template** — the lifecycle Lambda finds its candidates through the `USER` and `GROUP` partitions, so a user missing from GSI3 never gets a mail. Confirm with the user whether `wdh-main` holds real data needing backfill before relying on `/admin/*` results as complete.

---

## How to create in the AWS Console

1. DynamoDB → **Create table**
2. Table name: `wdh-main`
3. Partition key: `PK` (String)
4. Sort key: `SK` (String)
5. **Customize settings** → Capacity mode → **On-demand**
6. **Global Secondary Indexes** → Add index:
   - Index 1: partition key `GSI1PK` (String), sort key `GSI1SK` (String), index name `GSI1`, projection **All**
   - Index 2: partition key `GSI2PK` (String), sort key `GSI2SK` (String), index name `GSI2`, projection **All**
   - Index 3: partition key `GSI3PK` (String), sort key `GSI3SK` (String), index name `GSI3`, projection **All**
7. Create table

**Existing table (`wdh-main` already created before this feature):** DynamoDB lets you add a GSI to an existing table without downtime — go to the table → **Indexes** tab → **Create index** → same settings as Index 3 above. Existing items are not automatically backfilled with `GSI3PK`/`GSI3SK` (see backfill note above).

---

## Environment variable

Set on all five Lambda functions:

| Key | Value |
|---|---|
| `TABLE_NAME` | `wdh-main` |

`wiedoethet-admin` additionally requires `JWT_SECRET` (same value as the other three functions that verify/sign JWTs) — it re-verifies the caller's token on every request via `requireAdmin()`.

---

## Key patterns per entity

All four entity types share the single `wdh-main` table.

### User

| Key | Value | Example |
|---|---|---|
| `PK` | `USER#{id}` | `USER#a1b2c3` |
| `SK` | `PROFILE` | `PROFILE` |
| `GSI1PK` | `EMAIL#{email}` | `EMAIL#jan@example.nl` |
| `GSI1SK` | `USER` | `USER` |
| `GSI3PK` | `USER` | `USER` |
| `GSI3SK` | `{createdAt}#{id}` | `2026-08-20T10:00:00.000Z#a1b2c3` |

Used by: lookup by ID (GetItem on PK+SK), lookup by email (GSI1 query), admin — list/paginate all users newest-first (GSI3 query).

Mail-related attributes on the profile item (all optional, absent ⇒ `false`/unset): `mailOptOut` (boolean), `mailOptOutAt` (ISO 8601), `mailOptOutBy` (admin user id) and `lastSeenAt` (ISO 8601, touched at most once per 24 h on login, `GET /auth/me` and `GET /groups`). Written through `UpdateItem`, so no key changes.

### Group

| Key | Value | Example |
|---|---|---|
| `PK` | `GROUP#{id}` | `GROUP#d4e5f6` |
| `SK` | `METADATA` | `METADATA` |
| `GSI1PK` | `SHARE#{shareToken}` | `SHARE#tok-bbq-2026` |
| `GSI1SK` | `GROUP` | `GROUP` |
| `GSI2PK` | `INITIATOR#{userId}` | `INITIATOR#a1b2c3` |
| `GSI2SK` | `GROUP#{id}` | `GROUP#d4e5f6` |
| `GSI3PK` | `GROUP` | `GROUP` |
| `GSI3SK` | `{createdAt}#{id}` | `2026-08-20T10:00:00.000Z#d4e5f6` |

Used by: lookup by ID (GetItem), lookup by share token (GSI1), list all groups for a user (GSI2), admin — list/paginate all groups newest-first (GSI3 query).

### Task

| Key | Value | Example |
|---|---|---|
| `PK` | `GROUP#{groupId}` | `GROUP#d4e5f6` |
| `SK` | `TASK#{order:5digits}#{taskId}` | `TASK#00002#t7g8h9` |

Used by: list all tasks in a group (Query PK + SK begins\_with `TASK#`). Order prefix keeps tasks sorted by display order.

### Claim

| Key | Value | Example |
|---|---|---|
| `PK` | `TASK#{taskId}` | `TASK#t7g8h9` |
| `SK` | `CLAIM#{claimId}` | `CLAIM#c1d2e3` |
| `GSI1PK` | `GCLAIM#{groupId}` | `GCLAIM#d4e5f6` |
| `GSI1SK` | `{claimedAt ISO timestamp}` | `2026-03-10T10:00:00Z` |

Used by: list all claims on a task (Query PK + SK begins\_with `CLAIM#`), list all claims in a group for the scorecard (GSI1 query by `GCLAIM#{groupId}`).

---

## Access patterns summary

| Operation | Method | Key used |
|---|---|---|
| Login — find user by email | GSI1 query | `GSI1PK = EMAIL#{email}` |
| Get user profile | GetItem | `PK = USER#{id}`, `SK = PROFILE` |
| Resolve share link | GSI1 query | `GSI1PK = SHARE#{shareToken}` |
| Get group by ID | GetItem | `PK = GROUP#{id}`, `SK = METADATA` |
| List groups by initiator | GSI2 query | `GSI2PK = INITIATOR#{userId}`, `GSI2SK` begins\_with `GROUP#` |
| List tasks in group | Query | `PK = GROUP#{groupId}`, `SK` begins\_with `TASK#` |
| Count claims on task | Query | `PK = TASK#{taskId}`, `SK` begins\_with `CLAIM#` |
| Scorecard — all claims in group | GSI1 query | `GSI1PK = GCLAIM#{groupId}` |
| Admin — list/paginate all users | GSI3 query | `GSI3PK = USER`, sorted by `GSI3SK` |
| Admin — list/paginate all groups | GSI3 query | `GSI3PK = GROUP`, sorted by `GSI3SK` |
| Admin — count users/groups, "new in last 7 days" | GSI3 `Select: COUNT` query | `GSI3PK = USER\|GROUP` (+ `GSI3SK >= {7d ago ISO}` for the "new" counts) |
| Lifecycle — find candidates (registered users, groups) | GSI3 query | `GSI3PK = USER`, `GSI3PK = GROUP` |
| Lifecycle — "did we already mail this user?" | Query | `PK = USER#{userId}`, `SK` begins\_with `MAIL#` |
| Lifecycle — send exactly once | Conditional PutItem | `PK = USER#{userId}`, `SK = MAIL#{templateId}#{scopeId}`, `attribute_not_exists(PK)` |
| Admin/lifecycle — template config | GetItem | `PK = MAILTPL#{templateId}`, `SK = CONFIG` |
| Admin — last lifecycle run | GetItem | `PK = MAILSTATE#lifecycle`, `SK = LASTRUN` |
| Admin — mail log, newest first | GSI3 query (descending) | `GSI3PK = MAILLOG` |

## Mail automation items

Lifecycle mail automation (`wiedoethet-lifecycle`, admin Lambda; see `product/specs/mail-automation-api.spec.md`) adds three item types to `wdh-main`. **No new table and no new GSI.**

### Mail log row (exactly-once lock + admin log)

| Key | Value | Example |
|---|---|---|
| `PK` | `USER#{userId}` | `USER#a1b2c3` |
| `SK` | `MAIL#{templateId}#{scopeId}` (`scopeId` = groupId for group-scoped templates, `-` for user-scoped) | `MAIL#no_tasks#g9f8e7` |
| `GSI3PK` | `MAILLOG` (constant) | `MAILLOG` |
| `GSI3SK` | `{createdAt}#{userId}#{templateId}` | `2026-09-21T08:00:01.120Z#a1b2c3#no_tasks` |

The row is written with a conditional put (`attribute_not_exists(PK)`) *before* the mail is sent, so the same mail can never go out twice even if two runs overlap. Attributes: `id`, `templateId`, `userId`, `email`, `userName`, `groupId`, `groupName`, `subject`, `status` (`sending` → `sent` \| `failed`), `attempts` (max 3), `errorMessage`, `sesMessageId`, `createdAt`, `sentAt`. The rendered body is not stored. A row stuck in `sending` (Lambda crashed between put and SES) is never retried — at-most-once beats a duplicate. `failed` rows are retried on the next run until `attempts` reaches 3.

### Template configuration

| Key | Value |
|---|---|
| `PK` | `MAILTPL#{templateId}` |
| `SK` | `CONFIG` |

Attributes: `enabled`, `subject` / `bodyHtml` (`null` ⇒ default text from code), `enabledAt`, `updatedAt`, `updatedBy`. **An absent item means: template disabled, default text.** Template ids: `welcome`, `no_group`, `no_tasks`, `no_claims`, `day_after_event`, `dormant_30`, `dormant_60`. Not in GSI3.

### Last-run marker

| Key | Value |
|---|---|
| `PK` | `MAILSTATE#lifecycle` |
| `SK` | `LASTRUN` |

Single item, written at the start of every run (also dry runs and runs skipped by the master switch) and completed with the counts at the end: `at`, `masterEnabled`, `dryRun`, `evaluated`, `sent`, `failed`, `skippedByCap`. Shown on the admin Automation page.

Used by: lifecycle Lambda (candidate discovery, "already mailed?" check, exactly-once put), admin Lambda (`GET/PATCH /admin/mail-templates`, `GET /admin/mail-log`).
