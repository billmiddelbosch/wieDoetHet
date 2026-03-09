# Spec — Reminder: Web Push + SMS (S-02)

**Last Updated:** 2026-03-09 (review: fixed analytics event names, notification content, spec route paths and env var names)
**Feature ID:** S-02
**Branch:** feature/S02-whatsAppReminder

---

## Purpose

Allow the initiator to schedule an optional reminder per task and/or per group. When the scheduled time arrives and a task has not yet met its minimum number of claimants, the backend sends a Web Push notification (primary) or an SMS (fallback) to nudge the initiator to reshare the group link.

The reminder is non-blocking: it is optional, collapsed by default, and must not interfere with the primary task/group creation flow.

---

## Delivery Model

| Priority | Channel | When used |
|---|---|---|
| 1 | Web Push via AWS SNS | Always attempted first |
| 2 | SMS via AWS SNS SMS | Only when push is definitively unavailable (iOS PWA not installed, permission denied) OR when push send fails at fire time and a phone number exists |

"Definitively unavailable" means no valid `PUSH_SUB#{userId}` record exists in DynamoDB at fire time.

---

## Constraints & Prerequisites

- The initiator must have **at least one valid delivery channel** before a reminder can be set: a push subscription OR a phone number (E.164 format).
- The UI requires at least one channel and nudges the user towards push as the primary goal. All channel setup is handled **inline** — no redirect to another page.
- A task-level reminder only makes sense when `task.maxClaims` is set (i.e. there is a maximum to fill).
- A group-level reminder fires if **any** task in the group has not met its `maxClaims` by the scheduled time.
- One reminder per task (max), one reminder per group (max). Both optional and independent.
- The reminder section is collapsed by default — it must not add cognitive load to the primary creation flow.

---

## Push Subscription Timing

- **Primary path:** Push subscription is registered **silently** when the user installs the PWA, as part of the existing post-registration onboarding flow. No extra step or approval prompt is added to that flow.
- **Inline fallback path:** If the user arrives at the Herinnering section without a subscription, the section handles the missing channel inline (see UI Gate below).

---

## UI Placement

| Location | What is added |
|---|---|
| `TaskFormModal` (create + edit) | Collapsible "Herinnering" section at the bottom of the form |
| `GroupSettingsView` | Collapsible "Herinnering" section below the main settings form, above the danger zone |

No new routes are introduced.

---

## UI Gate — Herinnering Section (inline, no redirect)

When the section is expanded, the UI checks delivery channel availability and shows the appropriate state:

| User state | What the section shows |
|---|---|
| Push subscribed | Datetime picker + "Herinnering instellen" button — ready |
| Android, no push yet | Inline prompt to enable notifications (triggers browser permission request) |
| iOS, PWA not installed | Inline prompt to install the app to the home screen |
| Push denied + no phone number | Inline prompt to add a phone number in the profile |
| Push denied + phone number set | Datetime picker — SMS fallback confirmed |

The analytics event `reminder_push_required` replaces `reminder_phone_required` for the push-gate state.
The event `reminder_phone_required` is retained for the SMS-fallback-only gate.

---

## DynamoDB Design

### Existing entity — Reminder (unchanged)

Reminders are stored as first-class items in `wdh-main`. Key pattern unchanged from initial implementation.

| Key | Value | Example |
|---|---|---|
| `PK` | `REMINDER#task#{taskId}` or `REMINDER#group#{groupId}` | `REMINDER#task#abc123` |
| `SK` | `REMINDER` | `REMINDER` |
| `GSI1PK` | `RULE#{eventBridgeRuleName}` | `RULE#wdh-reminder-task-abc123` |
| `GSI1SK` | `REMINDER` | `REMINDER` |

#### Reminder item shape (unchanged)

```js
{
  PK:          'REMINDER#task#<taskId>',
  SK:          'REMINDER',
  GSI1PK:      'RULE#<ruleName>',
  GSI1SK:      'REMINDER',
  scope:       'task' | 'group',
  scopeId:     string,
  groupId:     string,
  initiatorId: string,
  scheduledAt: string,      // ISO 8601 UTC
  ruleName:    string,
  status:      'scheduled' | 'sent' | 'failed',
  createdAt:   string,
}
```

---

### New entity — Push Subscription

Stored separately from the user profile record to keep profiles clean and allow future multi-device support.

| Key | Value | Example |
|---|---|---|
| `PK` | `PUSH_SUB#{userId}` | `PUSH_SUB#user-abc123` |
| `SK` | `PUSH_SUB` | `PUSH_SUB` |

#### Push subscription item shape

```js
{
  PK:        'PUSH_SUB#<userId>',
  SK:        'PUSH_SUB',
  endpoint:  string,           // Web Push subscription endpoint URL
  keys: {
    p256dh:  string,           // ECDH public key
    auth:    string,           // Authentication secret
  },
  createdAt: string,
  updatedAt: string,
}
```

#### New key builders (to add to `lambda/shared/db.js`)

```js
pushSub: (userId) => ({ PK: `PUSH_SUB#${userId}`, SK: 'PUSH_SUB' }),
```

#### New access patterns

| Operation | Method | Key |
|---|---|---|
| Get push subscription for user | GetItem | `PK = PUSH_SUB#{userId}`, `SK = PUSH_SUB` |
| Save / update push subscription | PutItem | same |
| Delete push subscription | DeleteItem | same |

---

### New key builders for Reminder (already implemented in `lambda/shared/db.js`)

```js
reminder: (scope, id) => ({ PK: `REMINDER#${scope}#${id}`, SK: 'REMINDER' }),
reminderByRule: (ruleName) => ({ GSI1PK: `RULE#${ruleName}`, GSI1SK: 'REMINDER' }),
```

---

## Lambda Functions

### 1. `wiedoethet-reminders` — API handler (already implemented, unchanged)

**File:** `lambda/wiedoethet-reminders/index.js`

Routes handled:

```
POST   /reminders               — schedule a new reminder
GET    /reminders/{scope}/{id}  — get current reminder status
DELETE /reminders/{scope}/{id}  — cancel a scheduled reminder
```

No changes to this Lambda for the delivery model update. It schedules EventBridge rules; it does not send notifications.

---

### 2. `wiedoethet-push-subscriptions` — new API handler

**File:** `lambda/wiedoethet-push-subscriptions/index.js` *(new)*
**Runtime:** nodejs24.x

Routes:

```
POST   /push-subscriptions      — save or replace the user's push subscription
GET    /push-subscriptions/me   — check whether the authenticated user has an active subscription
DELETE /push-subscriptions/me   — remove the user's push subscription
```

#### POST /push-subscriptions

```js
// Body
{ endpoint: string, keys: { p256dh: string, auth: string } }

// Response 201
{ ok: true }
```

Handler logic:
1. `requireAuth(event)` — 401 if not authenticated
2. Validate body: `endpoint`, `keys.p256dh`, `keys.auth` all present
3. `putItem` the subscription record — overwrites any existing subscription for this user
4. Return `created({ ok: true })`

#### GET /push-subscriptions/me

```js
// Response 200 — subscription exists (keys never returned)
{ endpoint: string }

// Response 404 — no subscription
```

Handler logic:
1. `requireAuth(event)` — 401 if not authenticated
2. `getItem(PUSH_SUB#{user.sub}, PUSH_SUB)`
3. Return `ok({ endpoint })` — keys (p256dh, auth) are intentionally withheld

#### DELETE /push-subscriptions/me

```js
// Response 204
```

Handler logic:
1. `requireAuth(event)` — 401 if not authenticated
2. `deleteItem(PUSH_SUB#{user.sub}, PUSH_SUB)`
3. Return `noContent()`

---

### 3. `wiedoethet-reminder-fire` — EventBridge target (delivery logic updated)

**File:** `lambda/wiedoethet-reminder-fire/index.js` *(needs updating)*
**Runtime:** nodejs24.x
**Trigger:** EventBridge one-time scheduled rule

#### Updated handler logic

1. Extract `ruleName` from `event`
2. Query GSI1 `RULE#{ruleName}` to load the reminder record
3. If not found (cancelled): exit cleanly
4. If `status !== 'scheduled'`: exit cleanly, delete rule
5. Load group from DynamoDB to get `shareToken` and `name`
6. Check whether the minimum is still unmet (unchanged logic)
7. If all minimums met: update status to `sent` (vacuous), delete rule, exit

**Delivery sequence (replaces WhatsApp call):**

```
8a. Load PUSH_SUB#{initiatorId} from DynamoDB
8b. If subscription exists:
      → Send Web Push via AWS SNS
      → If SNS push succeeds: update status = 'sent', done
      → If SNS push fails (expired endpoint, 410 Gone, etc.):
          → Load initiator phoneNumber from USER#{initiatorId} PROFILE
          → If phone number exists: send SMS via SNS SMS
          → Update status = 'sent' (push failed, SMS sent) or 'failed' (both failed)
8c. If no subscription:
      → Load initiator phoneNumber
      → If phone number exists: send SMS via SNS SMS, update status = 'sent'
      → If no phone number: update status = 'failed'

9. Always deleteRule(ruleName) in finally block
```

#### Notification content

**Group-level:**
- Push title: `{{groupName}}`
- Push / SMS body: "Nog niet genoeg deelnemers voor alle taken. Deel de link opnieuw: https://wiedoethet.nl/g/{{shareToken}}"
- Tap action → `https://wiedoethet.nl/g/{{shareToken}}`

**Task-level:**
- Push title: `{{taskTitle}}` in `{{groupName}}`
- Push / SMS body: "Deze taak heeft nog niet genoeg deelnemers. Deel de link opnieuw: https://wiedoethet.nl/g/{{shareToken}}`"
- Tap action → `https://wiedoethet.nl/g/{{shareToken}}`

#### Updated environment variables

```
TABLE_NAME        = wdh-main
VAPID_PRIVATE_KEY = <VAPID private key for Web Push>
VAPID_PUBLIC_KEY  = <VAPID public key for Web Push>
VAPID_SUBJECT     = mailto:admin@wiedoethet.nl
AWS_REGION        = eu-west-2
```

SMS is sent via SNS SMS using the AWS SDK — no additional credentials needed beyond the Lambda execution role.

---

## Shared Utility: `lambda/shared/eventbridge.js` (already implemented, unchanged)

```js
export async function scheduleOneTimeRule(ruleName, scheduledAt, inputPayload) { ... }
export async function deleteRule(ruleName) { ... }
```

---

## IAM Permissions

### `wiedoethet-reminders` execution role (already updated, unchanged)

- `events:PutRule`, `events:PutTargets`, `events:RemoveTargets`, `events:DeleteRule` on `arn:aws:events:eu-west-2:344050431068:rule/wdh-reminder-*`
- `lambda:InvokeFunction` on `wiedoethet-reminder-fire`

### `wiedoethet-push-subscriptions` execution role (new)

Needs standard DynamoDB access (existing `WdhDynamoDBTableAccess` statement covers this).

### `wiedoethet-reminder-fire` execution role (additions needed)

Current grants: DynamoDB read/write on `wdh-main` + GSI1, EventBridge delete on `wdh-reminder-*`.

New additions required:

```json
{
  "Sid": "WdhSNSPublishPush",
  "Effect": "Allow",
  "Action": ["sns:Publish"],
  "Resource": "*"
},
{
  "Sid": "WdhSNSSMS",
  "Effect": "Allow",
  "Action": ["sns:Publish"],
  "Resource": "*"
}
```

> Note: SNS `Publish` for both Web Push (platform endpoints) and SMS cannot be scoped to a specific ARN when using ad-hoc endpoints — `"Resource": "*"` is standard for this pattern. Restrict by `aws:RequestedRegion` condition if desired.

EventBridge resource-based policy (already set):

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

### Already implemented (unchanged)

| Method | Path | Lambda | Auth |
|---|---|---|---|
| POST | `/reminders` | `wiedoethet-reminders` | Bearer JWT |
| GET | `/reminders/{scope}/{id}` | `wiedoethet-reminders` | Bearer JWT |
| DELETE | `/reminders/{scope}/{id}` | `wiedoethet-reminders` | Bearer JWT |
| OPTIONS | `/reminders` | (CORS mock) | None |
| OPTIONS | `/reminders/{scope}/{id}` | (CORS mock) | None |

### New (to add)

| Method | Path | Lambda | Auth |
|---|---|---|---|
| POST | `/push-subscriptions` | `wiedoethet-push-subscriptions` | Bearer JWT |
| GET | `/push-subscriptions/me` | `wiedoethet-push-subscriptions` | Bearer JWT |
| DELETE | `/push-subscriptions/me` | `wiedoethet-push-subscriptions` | Bearer JWT |
| OPTIONS | `/push-subscriptions` | (CORS mock) | None |
| OPTIONS | `/push-subscriptions/me` | (CORS mock) | None |

---

## Frontend: Composables

### useReminder (already implemented, unchanged)

```js
// src/composables/useReminder.js
{
  loading, error,
  fetchReminder(scope, id),
  scheduleReminder(scope, id, scheduledAt, groupId),
  cancelReminder(scope, id),
}
```

### usePushSubscription (new)

```js
// src/composables/usePushSubscription.js
{
  isSupported: Ref<boolean>,       // navigator.serviceWorker + PushManager available
  isSubscribed: Ref<boolean>,      // active subscription exists in DynamoDB
  isIos: Ref<boolean>,             // iOS detection (from existing usePwaInstall)
  isPwaInstalled: Ref<boolean>,    // standalone display mode
  loading: Ref<boolean>,
  error: Ref<string|null>,
  subscribe(): Promise<boolean>,   // request permission, register SW sub, POST to API
  unsubscribe(): Promise<boolean>, // DELETE from API, unsubscribe from PushManager
}
```

---

## Frontend: Component

### ReminderSection [MOLECULE] (partially implemented — gate logic needs updating)

**Atomic Level:** Molecule
**Atomic Rationale:** Composed of base atoms (BaseInput, BaseButton, BaseAlert, BaseBadge) plus local async state via `useReminder` and `usePushSubscription`. Reused in both TaskFormModal and GroupSettingsView without duplication.

#### Props (updated)

- `scope: 'task' | 'group'` (required)
- `id: string` (default: `''`) — taskId or groupId; empty in create mode with `deferred: true`
- `groupId: string` (default: null)
- `hasPushSubscription: boolean` (required) — replaces `hasPhoneNumber`
- `hasPhoneNumber: boolean` (required) — retained for SMS fallback gate
- `existingReminder: object | null` (default: null)
- `deferred: boolean` (default: false) — skips API call in task create mode

#### Emits (unchanged)

- `scheduled(scheduledAt: string)`
- `cancelled`

#### Behaviour (updated gate)

- Collapsed by default
- **Gate logic (inline, no redirect):**
  - Push subscribed → show datetime form
  - Android + no push → inline enable-notifications prompt (triggers `subscribe()`)
  - iOS + not installed → inline install-app prompt
  - Push denied/unavailable + no phone → inline prompt to add phone number (links to `/profile?redirect=...`)
  - Push denied/unavailable + phone set → show datetime form (SMS fallback confirmed)
- Reminder scheduled: show datetime, badge, cancel button
- Success / error alerts: unchanged (localized keys, 3s auto-dismiss)
- Deferred mode: unchanged (skips API, emits scheduledAt for parent to handle)

#### Implementation notes

- `GroupSettingsView` calls `fetchMe()` on mount (already implemented)
- `ReminderSection` tracks `lastOp` for error key selection (already implemented)
- `profileLink` computed includes `?redirect=` (already implemented)

---

## Analytics (updated)

```js
trackEvent('reminder_scheduled',      { scope, id })
trackEvent('reminder_cancelled',      { scope, id })
trackEvent('reminder_push_required',  { scope })   // replaces reminder_phone_required for push gate
trackEvent('reminder_phone_required', { scope })   // retained for SMS-fallback-only gate
trackEvent('reminder_push_subscribed', { scope })  // fires when user subscribes inline
```

---

## i18n Keys

### Already implemented (unchanged)

```
reminder.sectionTitle      reminder.noPhoneNumber    reminder.goToProfile
reminder.dateTimeLabel     reminder.save             reminder.cancel
reminder.scheduled         reminder.statusScheduled  reminder.statusSent
reminder.statusFailed      reminder.saveSuccess      reminder.cancelSuccess
reminder.errorSave         reminder.errorCancel      reminder.futureDateRequired
reminder.taskHint          reminder.groupHint
```

### New keys needed (to add to nl.json and en.json)

```
reminder.enablePush          "Schakel meldingen in om een herinnering te ontvangen."
reminder.enablePushCta       "Meldingen inschakelen"
reminder.installApp          "Installeer de app op je beginscherm om pushmeldingen te ontvangen."
reminder.installAppCta       "Hoe installeer ik de app?"
reminder.pushSubscribed      "Meldingen ingeschakeld."
reminder.taskHint            (update) "Je ontvangt een melding als deze taak nog niet vol is op het gekozen tijdstip."
reminder.groupHint           (update) "Je ontvangt een melding als een of meer taken nog niet vol zijn op het gekozen tijdstip."
```

> `taskHint` and `groupHint` should be updated: replace "WhatsApp-bericht" with "melding" in both nl.json and en.json.

---

## File Plan

### Already implemented (done)

```
lambda/
  wiedoethet-reminders/index.js          ✓ API handler
  wiedoethet-reminders/tests/index.test.js ✓
  wiedoethet-reminder-fire/index.js      ✓ (needs delivery logic update)
  wiedoethet-reminder-fire/tests/index.test.js ✓ (needs updating)
  shared/db.js                           ✓ reminder + reminderByRule keys
  shared/eventbridge.js                  ✓

src/
  composables/useReminder.js             ✓
  composables/__tests__/useReminder.test.js ✓
  components/molecules/ReminderSection.vue ✓ (needs gate update)
  views/GroupSettingsView.vue            ✓
  views/GroupDetailView.vue              ✓
  components/organisms/TaskFormModal.vue ✓
  views/ProfileView.vue                  ✓ (redirect param already implemented)
  i18n/locales/nl.json                   ✓ (hint keys need updating)
  i18n/locales/en.json                   ✓ (hint keys need updating)
  cypress/e2e/reminder.cy.js             ✓ (needs gate tests updating)
  product/specs/whatsapp-reminder.spec.md ✓
```

### New / needs updating

```
lambda/
  wiedoethet-push-subscriptions/
    index.js          ← new: POST/DELETE /push-subscriptions
    tests/index.test.js ← new
  wiedoethet-reminder-fire/index.js  ← update: replace WhatsApp with Push + SMS fallback
  wiedoethet-reminder-fire/tests/    ← update: reflect new delivery logic
  shared/db.js                       ← add pushSub key builder

src/
  composables/usePushSubscription.js ← new
  composables/__tests__/usePushSubscription.test.js ← new
  components/molecules/ReminderSection.vue ← update gate logic + new props
  i18n/locales/nl.json               ← add new keys, update hint keys
  i18n/locales/en.json               ← add new keys, update hint keys
  cypress/e2e/reminder.cy.js         ← update gate tests
```

---

## Acceptance Criteria

### Already passing (from initial implementation)

- [x] `POST /reminders` returns 401 / 403 / 400 / 201 correctly
- [x] Idempotent upsert replaces existing EventBridge rule
- [x] `GET /reminders/{scope}/{id}` returns `{ status: 'none' }` when no reminder
- [x] `DELETE /reminders/{scope}/{id}` removes rule and DynamoDB item; 404 if not found
- [x] Fire Lambda exits cleanly if reminder cancelled or already processed
- [x] Fire Lambda always deletes EventBridge rule in finally block
- [x] ReminderSection collapsed by default in both TaskFormModal and GroupSettingsView
- [x] Saving task/group without touching reminder section does not call reminder API
- [x] Deferred mode schedules reminder after task creation using returned taskId
- [x] Localized error keys shown (not raw server strings)
- [x] Success alerts auto-dismiss after 3 seconds
- [x] `/profile?redirect=` flow returns user to originating page after saving phone number

### Needs updating (delivery model change)

- [ ] Fire Lambda sends Web Push via SNS when `PUSH_SUB#{userId}` exists
- [ ] Fire Lambda falls back to SNS SMS when push fails and phone number is set
- [ ] Fire Lambda marks status `failed` when both push and SMS are unavailable
- [ ] Push notification title and body match spec content per scope (task vs group)
- [ ] SMS body matches spec content per scope

### New acceptance criteria

- [ ] `POST /push-subscriptions` saves subscription; `DELETE` removes it; both require JWT
- [ ] `usePushSubscription.subscribe()` requests browser permission, registers SW, calls API
- [ ] `ReminderSection` shows inline push-enable prompt on Android when no subscription
- [ ] `ReminderSection` shows inline install-app prompt on iOS when PWA not installed
- [ ] `ReminderSection` shows phone number prompt when push unavailable and no phone set
- [ ] `ReminderSection` shows datetime form when push unavailable but phone number set
- [ ] Push subscription is registered silently on PWA install (no extra onboarding step)
- [ ] `trackEvent('reminder_push_required', ...)` fires when push gate is shown
- [ ] `trackEvent('reminder_push_subscribed', ...)` fires on successful inline subscribe
- [ ] `taskHint` and `groupHint` i18n strings no longer reference WhatsApp
