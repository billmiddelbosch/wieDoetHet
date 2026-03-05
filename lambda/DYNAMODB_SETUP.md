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
7. Create table

---

## Environment variable

Set on all four Lambda functions:

| Key | Value |
|---|---|
| `TABLE_NAME` | `wdh-main` |

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

Used by: lookup by ID (GetItem on PK+SK), lookup by email (GSI1 query).

### Group

| Key | Value | Example |
|---|---|---|
| `PK` | `GROUP#{id}` | `GROUP#d4e5f6` |
| `SK` | `METADATA` | `METADATA` |
| `GSI1PK` | `SHARE#{shareToken}` | `SHARE#tok-bbq-2026` |
| `GSI1SK` | `GROUP` | `GROUP` |
| `GSI2PK` | `INITIATOR#{userId}` | `INITIATOR#a1b2c3` |
| `GSI2SK` | `GROUP#{id}` | `GROUP#d4e5f6` |

Used by: lookup by ID (GetItem), lookup by share token (GSI1), list all groups for a user (GSI2).

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
