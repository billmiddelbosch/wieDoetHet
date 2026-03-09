# AWS Setup — S-02 Reminder: Web Push + SMS

## 1. DynamoDB — no changes needed
The existing `wdh-main` table with GSI1 already supports both `REMINDER#scope#id` and `PUSH_SUB#{userId}` entities.

---

## 2. Generate VAPID keys (one-time, local)

```bash
npx web-push generate-vapid-keys
```

Save the output — you will need both keys in multiple places below. The public key also goes into the frontend `.env` file as `VITE_VAPID_PUBLIC_KEY`.

---

## 3. Enable SNS SMS (if not already active)

By default AWS SNS SMS is in sandbox mode — it can only send to verified phone numbers.

### 3a. Check current status
- [ ] Go to **AWS Console → SNS → Text messaging (SMS) → Overview**
- [ ] Look at the **Account spend limit** panel — if it shows "Sandbox" you need to request production access

### 3b. Verify a test number (sandbox only, for testing before going live)
- [ ] Go to **SNS → Text messaging → Sandbox destination phone numbers**
- [ ] Click **Add phone number** → enter your own number in E.164 format (e.g. `+31612345678`)
- [ ] Click **Send verification code** → enter the code you receive by SMS → click **Verify**
- [ ] Repeat for any other numbers you want to test with

### 3c. Request production access (required before sending to real users)
- [ ] Go to **SNS → Text messaging (SMS) → Overview**
- [ ] Click **Exit SMS sandbox**
- [ ] Fill in the AWS Support case form:
  - **Use case description:** Sending transactional reminder notifications to registered users of wieDoetHet. Users explicitly provide their phone number in their profile and consent to receive reminders.
  - **Website URL:** https://wiedoethet.nl
  - **Expected monthly volume:** start with an estimate (e.g. < 1 000 messages/month)
  - **Message type:** Transactional
- [ ] Submit — AWS typically responds within 24 hours

### 3d. Configure defaults (after production access is granted)
- [ ] Go to **SNS → Text messaging → SMS preferences → Edit**
- [ ] Set **Default message type** to `Transactional`
- [ ] Set **Default sender ID** to `wieDoetHet` (note: sender IDs are not supported in all countries — NL supports them)
- [ ] Set a **Monthly spend limit** appropriate for your expected volume (e.g. $10) to cap runaway costs
- [ ] Click **Save changes**

---

## 4. Create Lambda: `wiedoethet-reminders`

- [ ] **Create function** — runtime: Node.js 24.x, architecture: x86_64
- [ ] **Upload** `lambda/wiedoethet-reminders.zip`
- [ ] **Handler:** `index.handler`
- [ ] **Environment variables:**
  ```
  TABLE_NAME                  wdh-main
  JWT_SECRET                  <same secret as other functions>
  REMINDER_FIRE_LAMBDA_ARN    arn:aws:lambda:eu-west-2:344050431068:function:wiedoethet-reminder-fire
  AWS_REGION                  eu-west-2
  ```
- [ ] **Apply IAM policy** `wiedoethet-reminders/iam-policy-reminders-role.json`:
  ```bash
  aws iam put-role-policy --role-name wiedoethet-reminders-role \
    --policy-name WdhRemindersPolicy \
    --policy-document file://lambda/wiedoethet-reminders/iam-policy-reminders-role.json
  ```

---

## 5. Create Lambda: `wiedoethet-reminder-fire`

- [ ] **Create function** — runtime: Node.js 24.x, architecture: x86_64
- [ ] **Upload** `lambda/wiedoethet-reminder-fire.zip`
- [ ] **Handler:** `index.handler`
- [ ] **Timeout:** set to **30 seconds** (push + SMS calls may be slow)
- [ ] **Environment variables:**
  ```
  TABLE_NAME          wdh-main
  VAPID_PUBLIC_KEY    <generated in step 2>
  VAPID_PRIVATE_KEY   <generated in step 2>
  VAPID_SUBJECT       mailto:info@wiedoethet.nl
  AWS_REGION          eu-west-2
  ```
- [ ] **Apply IAM policy** `wiedoethet-reminder-fire/iam-policy-reminder-fire-role.json`:
  ```bash
  aws iam put-role-policy --role-name wiedoethet-reminder-fire-role \
    --policy-name WdhReminderFirePolicy \
    --policy-document file://lambda/wiedoethet-reminder-fire/iam-policy-reminder-fire-role.json
  ```

---

## 6. Create Lambda: `wiedoethet-push-subscriptions`

- [ ] **Bundle and zip:**
  ```bash
  cd lambda && npm run bundle:push-subscriptions
  cd dist/wiedoethet-push-subscriptions && zip -j ../../wiedoethet-push-subscriptions.zip index.js
  ```
- [ ] **Create function** — runtime: Node.js 24.x, architecture: x86_64
- [ ] **Upload** `lambda/wiedoethet-push-subscriptions.zip`
- [ ] **Handler:** `index.handler`
- [ ] **Environment variables:**
  ```
  TABLE_NAME    wdh-main
  JWT_SECRET    <same secret as other functions>
  AWS_REGION    eu-west-2
  ```
- [ ] **Apply IAM policy** `wiedoethet-push-subscriptions/iam-policy-push-subscriptions-role.json`:
  ```bash
  aws iam put-role-policy --role-name wiedoethet-push-subscriptions-role \
    --policy-name WdhPushSubscriptionsPolicy \
    --policy-document file://lambda/wiedoethet-push-subscriptions/iam-policy-push-subscriptions-role.json
  ```

---

## 7. Allow EventBridge to invoke `wiedoethet-reminder-fire`

- [ ] Add resource-based policy:
  ```bash
  aws lambda add-permission \
    --function-name wiedoethet-reminder-fire \
    --statement-id AllowEventBridgeInvoke \
    --action lambda:InvokeFunction \
    --principal events.amazonaws.com \
    --source-arn "arn:aws:events:eu-west-2:344050431068:rule/wdh-reminder-*"
  ```

---

## 8. API Gateway

### `wiedoethet-reminders` — reminder scheduling
- [ ] Create resource `/reminders`
- [ ] Create child resource `/reminders/{scope}`
- [ ] Create child resource `/reminders/{scope}/{id}`
- [ ] Wire methods:

  | Method | Resource | Lambda |
  |---|---|---|
  | POST | `/reminders` | `wiedoethet-reminders` |
  | GET | `/reminders/{scope}/{id}` | `wiedoethet-reminders` |
  | DELETE | `/reminders/{scope}/{id}` | `wiedoethet-reminders` |

- [ ] Enable CORS on all three resources

### `wiedoethet-push-subscriptions` — push subscription management
- [ ] Create resource `/push-subscriptions`
- [ ] Create child resource `/push-subscriptions/me`
- [ ] Wire methods:

  | Method | Resource | Lambda |
  |---|---|---|
  | POST | `/push-subscriptions` | `wiedoethet-push-subscriptions` |
  | GET | `/push-subscriptions/me` | `wiedoethet-push-subscriptions` |
  | DELETE | `/push-subscriptions/me` | `wiedoethet-push-subscriptions` |

- [ ] Enable CORS on all resources
- [ ] **Deploy** the API to the existing stage

---

## 9. Frontend — environment variables

- [ ] Add to `.env.local` (dev) and production deployment config:
  ```
  VITE_VAPID_PUBLIC_KEY=<generated in step 2 — public key only>
  ```

---

## 10. Verify end-to-end

- [ ] Register a new account and complete the onboarding → confirm service worker registered in DevTools → Application → Service Workers
- [ ] Open Group Settings → expand Herinnering → grant push permission → confirm subscription saved (`GET /push-subscriptions/me` returns 200)
- [ ] Set a reminder 2–3 minutes in the future → confirm EventBridge rule created in AWS Console → wait for it to fire → confirm push notification received
- [ ] Repeat with push permission denied + phone number set → confirm SMS received
- [ ] Cancel a reminder → confirm EventBridge rule deleted in AWS Console
