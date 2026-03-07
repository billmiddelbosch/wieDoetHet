# Feature: WhatsApp Poll Integration

## Overview

Initiators can send the task list as an interactive WhatsApp message. Recipients tap a task directly in WhatsApp to claim it — no app or account required. The claim is recorded under their WhatsApp display name.

---

## Message types

| Task count | WhatsApp format |
|---|---|
| 1–3 | Interactive button message (max 3 buttons) |
| 4–10 | Interactive list message (scrollable menu) |
| > 10 | Blocked — user is asked to split the group |

---

## Architecture

```
User (initiator)
  └─ ShareLinkPanel → POST /groups/{id}/whatsapp-poll
                          └─ wiedoethet-whatsapp Lambda
                              └─ Meta Cloud API → WhatsApp message to recipient

Recipient (WhatsApp)
  └─ Taps task button/list item
      └─ Meta webhook → POST /webhook/whatsapp
                            └─ wiedoethet-whatsapp Lambda
                                └─ DynamoDB: create Claim (anonymousName = WA display name)
```

---

## What is already built

- [x] `lambda/wiedoethet-whatsapp/index.js` — Lambda source with all 3 routes
- [x] `lambda/wiedoethet-whatsapp.zip` — Bundled and zipped, ready to deploy
- [x] `src/composables/useWhatsApp.js` — Frontend composable (`sendPoll`)
- [x] `src/components/molecules/ShareLinkPanel.vue` — Poll UI section added
- [x] `src/views/GroupDetailView.vue` — Passes `tasks` and `groupId` to ShareLinkPanel
- [x] `lambda/package.json` — `bundle:whatsapp` script added

---

## Actions required

### 1. Meta / WhatsApp Business setup

- [ ] Create or verify a **Meta Business Account** at business.facebook.com
- [ ] Create a **Meta App** (type: Business) in the Meta Developer portal
- [ ] Add the **WhatsApp** product to the app
- [ ] Register or verify a **WhatsApp Business phone number**
- [ ] Generate a **System User access token** with `whatsapp_business_messaging` permission
- [ ] Note down:
  - `WHATSAPP_PHONE_NUMBER_ID` (from the WhatsApp API setup page)
  - `WHATSAPP_ACCESS_TOKEN` (system user token)
  - `WHATSAPP_APP_SECRET` (from App Settings → Basic)

### 2. Deploy the new Lambda

- [ ] Create a new Lambda function in AWS: **`wiedoethet-whatsapp`**
  - Runtime: `Node.js 24.x`
  - Handler: `index.handler`
  - Architecture: `x86_64`
- [ ] Upload `lambda/wiedoethet-whatsapp.zip`
- [ ] Set environment variables:
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `WHATSAPP_ACCESS_TOKEN`
  - `WHATSAPP_APP_SECRET`
  - `WHATSAPP_VERIFY_TOKEN` (choose an arbitrary secret string)
  - `TABLE_NAME` = `wdh-main` (or relevant table)
- [ ] Attach the existing DynamoDB IAM policy (same as other lambdas)
- [ ] Set timeout to at least **10 seconds** (Meta API calls can be slow)

### 3. API Gateway — add routes

- [ ] Add the following routes to the existing API Gateway, pointing to `wiedoethet-whatsapp`:
  - `GET  /webhook/whatsapp`
  - `POST /webhook/whatsapp`
  - `POST /groups/{groupId}/whatsapp-poll`
- [ ] Enable **CORS** on the new routes
- [ ] Deploy the API Gateway stage

### 4. Register the webhook with Meta

- [ ] In the Meta Developer portal, go to **WhatsApp → Configuration → Webhooks**
- [ ] Set the **Callback URL** to:
  `https://<api-gateway-id>.execute-api.eu-west-2.amazonaws.com/development/webhook/whatsapp`
- [ ] Set the **Verify token** to the same value as `WHATSAPP_VERIFY_TOKEN`
- [ ] Click **Verify and Save**
- [ ] Subscribe to the **`messages`** webhook field

### 5. WhatsApp message template (if required)

> Meta requires pre-approved message templates for outbound messages to users who have not previously messaged your business number within 24 hours.

- [ ] Determine if recipients have opted in (i.e. messaged the number before)
- [ ] If not: create and submit a **message template** in the Meta Business Manager for the initial poll message
- [ ] Wait for template approval (typically 24–48 hours)
- [ ] Update `buildButtonMessage` / `buildListMessage` in `wiedoethet-whatsapp/index.js` to use the template format if required

### 6. Testing

- [ ] Send a test poll to your own WhatsApp number via the ShareLinkPanel
- [ ] Verify the interactive message arrives with correct task options
- [ ] Tap a task — verify a claim appears in the group detail view
- [ ] Verify the claim shows the WhatsApp display name
- [ ] Test duplicate prevention: tap the same task again — no second claim should appear
- [ ] Test capacity: tap a task that is already full — no claim should appear
- [ ] Test >10 tasks: verify the UI shows the "split group" warning
- [ ] Test the webhook signature verification (set a wrong `WHATSAPP_APP_SECRET` and confirm it rejects)

### 7. MSW mock (optional, for local dev without Meta credentials)

- [ ] Add a mock handler for `POST /groups/:groupId/whatsapp-poll` in `src/mocks/handlers.js` that returns `{ sent: true }` so the UI can be tested locally

---

## Environment variables summary

| Variable | Where | Description |
|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | Lambda env | Meta phone number ID |
| `WHATSAPP_ACCESS_TOKEN` | Lambda env | Meta system user access token |
| `WHATSAPP_APP_SECRET` | Lambda env | Meta app secret (webhook signature verification) |
| `WHATSAPP_VERIFY_TOKEN` | Lambda env | Arbitrary secret for webhook handshake |

---

## Key implementation notes

- Button IDs and list row IDs are formatted as `{groupId}:{taskId}` so the webhook can route claims without an extra DB lookup.
- The WhatsApp phone number (`from`) is stored as `sessionId` on the claim — this is used for deduplication (same number cannot claim the same task twice).
- The webhook always returns HTTP 200 to Meta, even on errors — required by Meta's spec.
- Task titles are truncated to 20 chars (buttons) or 24 chars (list rows) to comply with WhatsApp API limits.
