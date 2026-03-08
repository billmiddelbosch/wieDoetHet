# Spec — WhatsApp Reminder (S-02)

**Last Updated:** 2026-03-08 (REVIEW pass)
**Feature ID:** S-02
**Branch:** feature/S02-whatsAppReminder

---

## Purpose

Allow the initiator to schedule an optional WhatsApp reminder per task and/or per group. When the scheduled time arrives and a task has not yet met its minimum number of claimants, the backend sends a WhatsApp message to the initiator's profile phone number. The message nudges the initiator to reshare the group link.

The reminder is non-blocking: it is optional, collapsed by default, and must not interfere with the primary task/group creation flow.

---

## Constraints & Prerequisites

- The initiator must have a `phoneNumber` on their profile (E.164 format, already supported by `PATCH /auth/profile`). If not set, the reminder UI routes the initiator to `/profile` first.
- A task-level reminder only makes sense when `task.maxClaims` is set (i.e. there is a maximum to fill).
- A group-level reminder fires if **any** task in the group has not met its `maxClaims` by the scheduled time.
- One reminder per task (max), one reminder per group (max). Both optional and independent.
- The reminder section is collapsed by default — it must not add cognitive load to the primary creation flow.

---

## UI Placement

| Location | What is added |
|---|---|
| `TaskFormModal` (create + edit) | Collapsible "Herinnering" section at the bottom of the form |
| `GroupSettingsView` | Collapsible "Herinnering" section below the main settings form, above the danger zone |

No new routes are introduced.

---

## DynamoDB Design

### Single-table fit — new Reminder entity

Reminders are stored as first-class items in `wdh-main` alongside existing entities. Two access patterns are needed:

1. **Get reminder for a specific task or group** (initiator loads settings)
2. **The reminder Lambda looks itself up** (fired by EventBridge — needs to self-identify)

#### Key pattern

| Key | Value | Example |
|---|---|---|
| `PK` | `REMINDER#task#{taskId}` or `REMINDER#group#{groupId}` | `REMINDER#task#abc123` |
| `SK` | `REMINDER` | `REMINDER` |
| `GSI1PK` | `RULE#{eventBridgeRuleName}` | `RULE#wdh-reminder-task-abc123` |
| `GSI1SK` | `REMINDER` | `REMINDER` |

The `GSI1PK` lookup allows the EventBridge-triggered Lambda to resolve the full reminder record from its own rule name (passed as an environment variable or event payload).

#### Reminder item shape

```js
{
  PK:       'REMINDER#task#<taskId>',   // or 'REMINDER#group#<groupId>'
  SK:       'REMINDER',
  GSI1PK:   'RULE#<eventBridgeRuleName>',
  GSI1SK:   'REMINDER',
  scope:    'task' | 'group',
  scopeId:  string,           // taskId or groupId
  groupId:  string,           // always set — needed by fire Lambda to build share URL
  initiatorId: string,        // userId of the initiator
  scheduledAt: string,        // ISO 8601 UTC
  ruleName:    string,        // EventBridge rule name  e.g. 'wdh-reminder-task-abc123'
  status:   'scheduled' | 'sent' | 'failed',
  createdAt:   string,
}
```

#### New key builder (added to `lambda/shared/db.js`)

```js
reminder: (scope, id) => ({
  PK: `REMINDER#${scope}#${id}`,
  SK: 'REMINDER',
}),
reminderByRule: (ruleName) => ({
  GSI1PK: `RULE#${ruleName}`,
  GSI1SK: 'REMINDER',
}),
```

#### New access patterns

| Operation | Method | Key |
|---|---|---|
| Get reminder for task/group | GetItem | `PK = REMINDER#task#{id}`, `SK = REMINDER` |
| Delete reminder for task/group | DeleteItem | same |
| Fire Lambda: look up reminder by rule name | GSI1 query | `GSI1PK = RULE#{ruleName}` |

---

## Lambda Functions

### 1. `wiedoethet-reminders` — API handler

**File:** `lambda/wiedoethet-reminders/index.js`
**Runtime:** nodejs24.x
**Handler:** index.handler
**Follows:** same ESM handler pattern as all other Lambda functions

Routes handled:

```
POST   /reminders          — schedule a new reminder
GET    /reminders/{scope}/{id}  — get current reminder status
DELETE /reminders/{scope}/{id}  — cancel a scheduled reminder
```

#### POST /reminders

```js
// Body
{
  scope: 'task' | 'group',  // required
  id: string,               // required — taskId or groupId
  scheduledAt: string,      // required — ISO 8601 UTC, must be in the future
}

// Response 201
{
  scope, id, scheduledAt, status: 'scheduled', ruleName
}
```

Handler logic:
1. `requireAuth(event)` — 401 if not authenticated
2. Validate body: `scope`, `id`, `scheduledAt` all present; `scheduledAt` must be a valid future ISO string
3. Load the task or group from DynamoDB to verify the initiator owns it; 403 if not
4. If a reminder already exists for this scope+id: delete the existing EventBridge rule first (idempotent update)
5. Build EventBridge rule name: `wdh-reminder-${scope}-${id}` (truncated to 64 chars, hyphens only)
6. Call `EventBridgeClient.putRule()` with `ScheduleExpression: at(${scheduledAt})` and state `ENABLED`
7. Call `EventBridgeClient.putTargets()` targeting the `wiedoethet-reminder-fire` Lambda ARN, passing `{ ruleName }` as the input
8. Write reminder item to DynamoDB (`putItem`)
9. Return `created({ scope, id, scheduledAt, status: 'scheduled', ruleName })`

#### GET /reminders/{scope}/{id}

```js
// Response 200
{ scope, id, scheduledAt, status }
// Response 200 (no reminder set)
{ scope, id, scheduledAt: null, status: 'none' }
```

Handler logic:
1. `requireAuth(event)` — 401 if not authenticated
2. `getItem(REMINDER#${scope}#${id}, REMINDER)` — if not found return `{ scheduledAt: null, status: 'none' }`
3. Verify `initiatorId === user.sub` — 403 if not
4. Return `ok(stripKeys(item))`

#### DELETE /reminders/{scope}/{id}

```js
// Response 204
```

Handler logic:
1. `requireAuth(event)` — 401 if not authenticated
2. Load reminder item; 404 if not found; 403 if not owner
3. Call `EventBridgeClient.removeTargets()` then `EventBridgeClient.deleteRule()` for the stored `ruleName`
4. `deleteItem(REMINDER#${scope}#${id}, REMINDER)`
5. Return `noContent()`

---

### 2. `wiedoethet-reminder-fire` — EventBridge target

**File:** `lambda/wiedoethet-reminder-fire/index.js`
**Runtime:** nodejs24.x
**Handler:** index.handler
**Trigger:** EventBridge scheduled rule (one-time `at(...)` expression per reminder)

This Lambda is **not** invoked via API Gateway. It receives an EventBridge event with `{ ruleName }` in the event payload.

Handler logic:
1. Extract `ruleName` from `event` (the input set via `putTargets`)
2. Query GSI1 with `GSI1PK = RULE#{ruleName}` to load the reminder record
3. If not found (already cancelled): exit cleanly — no-op
4. If `status !== 'scheduled'`: exit cleanly — already processed
5. Load the group from DynamoDB to get `shareToken` and `name`
6. Load tasks for the group; check if any task has `claimCount < maxClaims` (unmet minimum)
7. Load the initiator's `phoneNumber` from `USER#{initiatorId}` profile
8. If all tasks are full OR initiator has no phone number: update reminder status to `sent` (vacuous send), clean up rule, exit
9. Call WhatsApp Business API (`POST https://graph.facebook.com/v19.0/{phoneNumberId}/messages`) with the reminder message
10. Update reminder `status` to `sent` (or `failed` if the API call errors)
11. Delete the EventBridge rule: `removeTargets` then `deleteRule`

**WhatsApp message format (Dutch):**
```
Herinnering: je groep "{{groupName}}" heeft nog niet genoeg deelnemers voor alle taken.
Deel de link opnieuw om iedereen te laten meedoen:
https://wiedoethet.nl/g/{{shareToken}}
```

**Environment variables required:**
```
TABLE_NAME          = wdh-main
WHATSAPP_TOKEN      = Bearer <Meta access token>
WHATSAPP_PHONE_ID   = <Meta phone number ID>
```

---

## Shared Utility: `lambda/shared/eventbridge.js` (new)

To keep handlers clean, EventBridge calls are wrapped in a shared module — matching the pattern of `lambda/shared/db.js`.

```js
// lambda/shared/eventbridge.js
import { EventBridgeClient, PutRuleCommand, PutTargetsCommand, RemoveTargetsCommand, DeleteRuleCommand } from '@aws-sdk/client-eventbridge'

const eb = new EventBridgeClient({ region: 'eu-west-2' })

export async function scheduleOneTimeRule(ruleName, scheduledAtIso, targetArn, inputPayload) { ... }
export async function deleteRule(ruleName) { ... }
```

---

## IAM Permissions

The `wiedoethet-reminders` Lambda execution role needs these additions beyond the existing DynamoDB policy:

```json
{
  "Sid": "WdhEventBridgeReminderManage",
  "Effect": "Allow",
  "Action": [
    "events:PutRule",
    "events:PutTargets",
    "events:RemoveTargets",
    "events:DeleteRule"
  ],
  "Resource": "arn:aws:events:eu-west-2:344050431068:rule/wdh-reminder-*"
},
{
  "Sid": "WdhLambdaInvokeReminderFire",
  "Effect": "Allow",
  "Action": ["lambda:InvokeFunction"],
  "Resource": "arn:aws:lambda:eu-west-2:344050431068:function:wiedoethet-reminder-fire"
}
```

The `wiedoethet-reminder-fire` Lambda execution role needs:

```json
{
  "Sid": "WdhDynamoDBReminderAccess",
  "Effect": "Allow",
  "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:Query"],
  "Resource": [
    "arn:aws:dynamodb:eu-west-2:344050431068:table/wdh-main",
    "arn:aws:dynamodb:eu-west-2:344050431068:table/wdh-main/index/GSI1"
  ]
},
{
  "Sid": "WdhEventBridgeReminderDelete",
  "Effect": "Allow",
  "Action": ["events:RemoveTargets", "events:DeleteRule"],
  "Resource": "arn:aws:events:eu-west-2:344050431068:rule/wdh-reminder-*"
}
```

EventBridge also needs permission to invoke `wiedoethet-reminder-fire` — set via a **Lambda resource-based policy** (not an IAM role):

```bash
aws lambda add-permission \
  --function-name wiedoethet-reminder-fire \
  --statement-id AllowEventBridgeInvoke \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn "arn:aws:events:eu-west-2:344050431068:rule/wdh-reminder-*"
```

---

## API Gateway Configuration

Two new Lambda integrations to add in the AWS Console (matching existing setup):

| Method | Path | Lambda | Auth |
|---|---|---|---|
| POST | `/reminders` | `wiedoethet-reminders` | Bearer JWT |
| GET | `/reminders/{scope}/{id}` | `wiedoethet-reminders` | Bearer JWT |
| DELETE | `/reminders/{scope}/{id}` | `wiedoethet-reminders` | Bearer JWT |
| OPTIONS | `/reminders` | (CORS mock) | None |
| OPTIONS | `/reminders/{scope}/{id}` | (CORS mock) | None |

`wiedoethet-reminder-fire` is **not** exposed via API Gateway — it is invoked only by EventBridge.

---

## Frontend: Composable

### useReminder

```js
// src/composables/useReminder.js
{
  loading: Ref<boolean>,
  error: Ref<string | null>,
  scheduleReminder(scope: 'task'|'group', id: string, scheduledAt: string): Promise<void>,
  cancelReminder(scope: 'task'|'group', id: string): Promise<void>,
  fetchReminder(scope: 'task'|'group', id: string): Promise<{ scheduledAt: string|null, status: string }>,
}
```

All calls use the configured Axios instance at `@/lib/axios.js`.

---

## Frontend: Component

### ReminderSection [MOLECULE]

**Atomic Level:** Molecule
**Atomic Rationale:** Composed of base atoms (BaseInput, BaseButton, BaseAlert, BaseBadge) plus local async state via `useReminder`. Reused in both TaskFormModal and GroupSettingsView without duplication.

Props:
- `scope: 'task' | 'group'` (required)
- `id: string` (required) — taskId or groupId
- `hasPhoneNumber: boolean` (required)
- `existingReminder: { scheduledAt: string|null, status: string } | null` (default: null)

Emits:
- `scheduled (scheduledAt: string)`
- `cancelled`

Behaviour:
- Collapsed by default; expand to show the form
- No phone number: shows prompt with `RouterLink` to `/profile`
- Phone number present: shows `datetime-local` picker + save button
- Reminder already scheduled: shows scheduled datetime, status badge, and cancel button
- Status badge values: `Ingepland` / `Verstuurd` / `Mislukt`
- On successful schedule: shows `reminder.saveSuccess` alert for 3 seconds
- On successful cancel: shows `reminder.cancelSuccess` alert for 3 seconds
- On API failure: shows localized `reminder.errorSave` or `reminder.errorCancel` (never raw server error string)

Implementation notes:
- `GroupSettingsView` calls `fetchMe()` in `onMounted` (alongside `fetchGroup`) to populate `authStore.user` and enable correct `hasPhoneNumber` evaluation — required because the route is auth-gated but user profile is not preloaded by the app shell
- `ReminderSection` tracks `lastOp` ('save'|'cancel') to select the correct error key; success alerts auto-dismiss after 3s via `setTimeout`

i18n namespace: `reminder.*`

---

## Frontend: Data Model Extensions

These fields are returned by the existing group/task endpoints (stored on the DynamoDB records) and surfaced in the frontend domain objects:

### Task (extended)
```js
{
  // existing fields ...
  reminder: { scheduledAt: string|null, status: 'none'|'scheduled'|'sent'|'failed' } | null
}
```

### Group (extended)
```js
{
  // existing fields ...
  reminder: { scheduledAt: string|null, status: 'none'|'scheduled'|'sent'|'failed' } | null
}
```

---

## Analytics

```js
trackEvent('reminder_scheduled',     { scope, id })
trackEvent('reminder_cancelled',     { scope, id })
trackEvent('reminder_phone_required', { scope })
```

---

## i18n Keys

Add to both `nl.json` and `en.json`.

```
reminder.sectionTitle    "Herinnering"
reminder.noPhoneNumber   "Voeg eerst een telefoonnummer toe aan je profiel om een herinnering in te stellen."
reminder.goToProfile     "Ga naar profiel"
reminder.dateTimeLabel   "Stuur herinnering op"
reminder.save            "Herinnering instellen"
reminder.cancel          "Herinnering annuleren"
reminder.scheduled       "Ingepland voor {datetime}"
reminder.statusScheduled "Ingepland"
reminder.statusSent      "Verstuurd"
reminder.statusFailed    "Mislukt"
reminder.saveSuccess     "Herinnering ingesteld."
reminder.cancelSuccess   "Herinnering geannuleerd."
reminder.errorSave       "Herinnering kon niet worden ingesteld. Probeer het opnieuw."
reminder.errorCancel     "Herinnering kon niet worden geannuleerd. Probeer het opnieuw."
reminder.taskHint        "Je ontvangt een WhatsApp-bericht als deze taak nog niet vol is op het gekozen tijdstip."
reminder.groupHint       "Je ontvangt een WhatsApp-bericht als een of meer taken nog niet vol zijn op het gekozen tijdstip."
```

---

## File Plan

```
lambda/
  wiedoethet-reminders/
    index.js          ← API handler (POST/GET/DELETE /reminders)
    tests/
      index.test.js
  wiedoethet-reminder-fire/
    index.js          ← EventBridge-triggered fire handler
    tests/
      index.test.js
  shared/
    db.js             ← add reminder + reminderByRule key builders
    eventbridge.js    ← new: scheduleOneTimeRule, deleteRule helpers

src/
  composables/
    useReminder.js
  components/
    molecules/
      ReminderSection.vue
  views/
    GroupSettingsView.vue   ← add ReminderSection
  components/organisms/
    TaskFormModal.vue       ← add ReminderSection
  i18n/locales/
    nl.json                 ← add reminder.* keys
    en.json                 ← add reminder.* keys
```

---

## Acceptance Criteria

### Backend — `wiedoethet-reminders`
- [ ] `POST /reminders` returns 401 when no JWT is provided
- [ ] `POST /reminders` returns 403 when the authenticated user is not the group/task initiator
- [ ] `POST /reminders` returns 400 when `scheduledAt` is in the past
- [ ] `POST /reminders` returns 201 and creates a DynamoDB reminder item and an EventBridge rule
- [ ] Re-posting to the same scope+id replaces the existing rule (idempotent update)
- [ ] `GET /reminders/{scope}/{id}` returns `{ scheduledAt: null, status: 'none' }` when no reminder exists
- [ ] `DELETE /reminders/{scope}/{id}` removes the EventBridge rule and the DynamoDB item
- [ ] `DELETE /reminders/{scope}/{id}` returns 404 if no reminder exists

### Backend — `wiedoethet-reminder-fire`
- [ ] Exits cleanly (no WhatsApp call) if the reminder record is not found (already cancelled)
- [ ] Exits cleanly if all tasks are already full at fire time
- [ ] Sends WhatsApp message to the initiator's phone number when tasks are unmet
- [ ] Updates reminder `status` to `sent` after a successful WhatsApp call
- [ ] Updates reminder `status` to `failed` if the WhatsApp API returns an error
- [ ] Deletes the EventBridge rule after firing (success or failure)

### Frontend — phone number gate
- [ ] When `hasPhoneNumber` is false, the reminder section shows the profile prompt instead of the form
- [ ] Clicking "Ga naar profiel" navigates to `/profile`
- [ ] `trackEvent('reminder_phone_required', ...)` fires when the prompt is shown

### Frontend — task-level reminder
- [ ] Reminder section in TaskFormModal is collapsed by default
- [ ] Saving a task without touching the reminder section does not create or modify any reminder
- [ ] Initiator can set a datetime and save; section shows scheduled datetime and "Ingepland" badge
- [ ] Initiator can cancel the task reminder; section resets to empty form
- [ ] `trackEvent('reminder_scheduled', { scope: 'task', id })` fires on successful save
- [ ] `trackEvent('reminder_cancelled', { scope: 'task', id })` fires on successful cancel

### Frontend — group-level reminder
- [ ] Reminder section in GroupSettingsView is collapsed by default
- [ ] Initiator can set a datetime and save; section shows scheduled datetime and "Ingepland" badge
- [ ] Initiator can cancel the group reminder
- [ ] `trackEvent('reminder_scheduled', { scope: 'group', id })` fires on successful save
- [ ] `trackEvent('reminder_cancelled', { scope: 'group', id })` fires on successful cancel

### Frontend — error handling
- [ ] API failure on schedule shows `BaseAlert` with `reminder.errorSave`; no state change
- [ ] API failure on cancel shows `BaseAlert` with `reminder.errorCancel`; existing reminder preserved

### General
- [ ] `ReminderSection` is reused in both TaskFormModal and GroupSettingsView without duplication
- [ ] All user-visible strings use i18n keys — no hardcoded text in components
