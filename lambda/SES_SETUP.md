# SES Setup — wieDoetHet

Supports two features: the Admin Mail Users feature (`POST /admin/mail` on `wiedoethet-admin`, which sends an HTML email — subject + rich-text body — to one or many platform users) and the lifecycle mail automation (the scheduled `wiedoethet-lifecycle` function, see section 6). See `product/specs/admin-api.spec.md` for the full request/response contract.

**Every step below is a manual AWS Console action that has NOT been performed against the live account.** This document only records what needs to happen and how — no real AWS action (identity verification, sandbox/production access request, IAM attachment, env var, Lambda dependency upload) has been carried out as part of building this feature.

---

## Region

| Setting | Value |
|---|---|
| SES region | `eu-west-2` (same region as the rest of the stack) |

---

## 1. Verify a sending identity

SES will not send mail from an unverified identity. Two options:

### Option A — verify a domain (recommended for production)

1. SES Console → **Verified identities** → **Create identity**
2. Identity type: **Domain**
3. Enter the sending domain, e.g. `wiedoethet.nl`
4. Enable **Easy DKIM** (recommended — improves deliverability/inbox placement)
5. SES generates a set of DNS records (DKIM CNAMEs, and an MX/TXT if using SES for receiving too — not needed here)
6. Add those DNS records at the domain's DNS provider
7. Wait for verification to complete (DNS propagation — typically minutes to a few hours); the identity's status flips to **Verified** in the console

Once the domain itself is verified, any address `@wiedoethet.nl` can be used as the `SES_FROM_EMAIL` (e.g. `noreply@wiedoethet.nl`) without separately verifying that exact mailbox.

### Option B — verify a single email address (fastest for testing)

1. SES Console → **Verified identities** → **Create identity**
2. Identity type: **Email address**
3. Enter the exact address to send from, e.g. `noreply@wiedoethet.nl`
4. SES sends a confirmation link to that inbox — click it to verify
5. Status flips to **Verified**

This is enough to start sending, but only from that one exact address, and (while still in the sandbox — see below) recipients must *also* be individually verified.

---

## 2. Sandbox vs. production access

New SES accounts start in the **sandbox**, with hard limits:

| Sandbox limit | Value |
|---|---|
| Send rate | ~1 email/second |
| Send quota | 200 emails per 24-hour period |
| Recipients | Must be a verified identity themselves (can only email addresses/domains you've also verified in SES) |

For the Admin Mail Users feature to actually reach arbitrary platform users' inboxes, the account needs **production access**:

1. SES Console → **Account dashboard** → **Request production access** (or **Sending statistics** → banner link)
2. Fill in the request form:
   - Mail type: **Transactional** (admin-initiated communications to registered users)
   - Website URL: the wieDoetHet production URL
   - Use case description: briefly describe that this is an admin panel sending opt-in-adjacent transactional emails to registered platform users, with bounce/complaint handling via SES's own mechanisms
   - Expected sending volume: rough estimate (this is a low-volume admin tool, not a marketing blast)
3. Submit — AWS typically reviews and responds within 24 hours
4. Once approved, the account-level sandbox limits are lifted (production sending limits are still rate/quota-bounded, but far higher, and start conservative and increase automatically with a good sending reputation)

**Until production access is granted, `/admin/mail` will only succeed for recipients whose email address is itself a verified SES identity** — every other send will fail and show up in that request's `failures[]` array (see admin-api.spec.md), it will not silently succeed.

---

## 3. Lambda environment variable

Set on `wiedoethet-admin` (for the lifecycle function see section 6.3):

| Key | Value | Notes |
|---|---|---|
| `SES_FROM_EMAIL` | e.g. `noreply@wiedoethet.nl` | Must be a verified identity (Option A or B above) — `sendMail()` in `lambda/shared/ses.js` throws if this is unset, which surfaces as a 500 with every recipient in `failures[]` |
| `SES_REPLY_TO_EMAIL` | the monitored mailbox | **Required.** Reply-To header and the address in the footer of every mail. `POST /admin/mail` returns 500 when it is missing |

Set them the same way as the existing `TABLE_NAME`/`JWT_SECRET` variables: Lambda Console → `wiedoethet-admin` → **Configuration** → **Environment variables**.

---

## 4. IAM permissions

Attach `lambda/iam-policy-ses.json` to the `wiedoethet-admin` function's execution role (and to the `wiedoethet-lifecycle` role, see section 6.4) (as an additional inline or managed policy — alongside the existing DynamoDB policy from `lambda/iam-policy-dynamodb.json`, do not replace it).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "WdhSesSendAccess",
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": ["arn:aws:ses:eu-west-2:344050431068:identity/*"]
    }
  ]
}
```

To scope this more tightly once the exact sending identity is finalized, replace the `identity/*` resource with the specific identity ARN, e.g. `arn:aws:ses:eu-west-2:344050431068:identity/wiedoethet.nl`.

**How to attach in the Console:**

1. Lambda Console → `wiedoethet-admin` → **Configuration** → **Permissions**
2. Click the execution role name (opens IAM Console)
3. **Add permissions** → **Create inline policy** → **JSON** tab → paste the contents of `lambda/iam-policy-ses.json`
4. Name it (e.g. `WdhSesSendAccess`) → **Create policy**

---

## 5. Dependency bundling

`@aws-sdk/client-ses` is added to `lambda/package.json`'s `dependencies`. No changes to the esbuild bundle scripts are needed — `npm run bundle:admin` already passes `--external:@aws-sdk/*` (a wildcard covering every `@aws-sdk/*` package), which relies on the Lambda Node.js 24.x managed runtime providing the AWS SDK v3 at execution time. Run `npm install` in `lambda/` before the next `bundle:admin`/deploy so the dependency is recorded in `package-lock.json`.

---

---

## 6. Lifecycle mail (`wiedoethet-lifecycle`)

Automatic mails (welcome, no group, group without tasks/claims, day after the event, dormant) sent by a scheduled Lambda. Contract: `product/specs/mail-automation-api.spec.md`; behaviour and admin UI: `product/specs/mail-automation.spec.md`. The function is **not** behind API Gateway — EventBridge Scheduler invokes it.

**Nothing in this section has been performed against the live account.** Everything ships switched off: `LIFECYCLE_MAIL_ENABLED` defaults to off and every template is disabled until an admin turns it on.

### 6.1 Prerequisites

- **GSI3 backfill** (`lambda/scripts/backfill-gsi3.js`, backlog ADM-07) — the function finds its candidates through GSI3. Users written before the admin section shipped are invisible to it until the backfill has run. See `DYNAMODB_SETUP.md`.
- **Production SES access** (section 2). In the sandbox only verified recipients are reachable and the send rate is 1/s; the function sends with a concurrency of 5, so throttled sends end up `failed` in the log and are retried by the next run (max 3 attempts per mail).
- **A monitored reply mailbox.** Every mail's footer tells users to *reply* to make suggestions or to opt out, so `SES_REPLY_TO_EMAIL` must point at a mailbox somebody reads. Opt-outs are then applied by an admin (Admin → Users → user → *E-mailvoorkeuren*). The address must also be put in `public/contact.md` (currently a flagged placeholder).
- **SPF/DKIM/DMARC aligned** for the sending domain (section 1, Option A). Check the domain's DMARC policy before the first automated send.

### 6.2 Create the function

Lambda Console → **Create function**:

| Setting | Value |
|---|---|
| Name | `wiedoethet-lifecycle` |
| Runtime | Node.js 24.x |
| Handler | `index.handler` |
| Timeout | 5 min (a run is capped at 50 sends, but candidate discovery pages through GSI3) |
| Memory | 256 MB |

Then upload the bundle: `cd lambda && npm run deploy:lifecycle` (bundles `wiedoethet-lifecycle/index.js` with esbuild and uploads it to `$LATEST`; needs the AWS CLI + credentials). The script only updates code — it does not create the function, role, variables or schedule.

### 6.3 Environment variables

| Key | Value | Notes |
|---|---|---|
| `TABLE_NAME` | `wdh-main` | Same table as the other functions |
| `SES_FROM_EMAIL` | e.g. `noreply@wiedoethet.nl` | Verified identity (section 1) |
| `SES_REPLY_TO_EMAIL` | the monitored mailbox | **Required.** Reply-To header and the address printed in every footer. Without it a real run does nothing and logs `lifecycle-misconfigured` (fail closed) |
| `APP_URL` | `https://wiedoethet.nl` | Base URL for links in the mails; defaults to `https://wiedoethet.nl` |
| `LIFECYCLE_MAIL_ENABLED` | `true` | **Master kill switch.** Only the exact string `true` lets the function send. Unset or any other value ⇒ each run only records itself and exits |
| `LIFECYCLE_MAX_SENDS_PER_RUN` | `50` | Optional. Hard cap per run; the surplus waits for the next scheduled run |

`SES_REPLY_TO_EMAIL` must **also** be set on `wiedoethet-admin`: the manual `POST /admin/mail` and the template test mail use the same footer, and `POST /admin/mail` returns 500 when it is missing.

### 6.4 IAM

Give the function's execution role the same two policies as the admin function: `lambda/iam-policy-dynamodb.json` (Get/Put/Update/Delete/Query on `wdh-main` and its indexes) and `lambda/iam-policy-ses.json` (section 4), plus `AWSLambdaBasicExecutionRole` for CloudWatch Logs.

### 6.5 Schedule (EventBridge Scheduler)

EventBridge → **Scheduler** → **Create schedule**:

| Setting | Value |
|---|---|
| Schedule type | Recurring, cron-based |
| Cron expression | `cron(0 10 ? * MON-FRI *)` |
| Time zone | `Europe/Amsterdam` (Scheduler handles DST; the function also refuses to send outside the 10:00 Amsterdam hour) |
| Flexible time window | Off |
| Target | AWS Lambda **Invoke** → `wiedoethet-lifecycle` |
| Payload | `{}` |
| Retry policy | Retry 0 times — a run is idempotent, the next weekday's run picks up what is left |
| Execution role | A role Scheduler may assume, with `lambda:InvokeFunction` on `wiedoethet-lifecycle` (the console can create it) |

Why 10:00 on weekdays: people read private mail most on weekday mornings, and Tuesday–Thursday are the strongest days. So `welcome` may go out Monday–Friday, while the other templates (`no_group`, `no_tasks`, `no_claims`, `day_after_event`, `dormant_*`) only go out Tuesday–Thursday. Never at weekends.

### 6.6 First run — verify before enabling

1. Invoke the function from the console with `lambda/wiedoethet-lifecycle/tests/dry-run.json` (`{"dryRun": true}`). It evaluates every **enabled** template, sends and logs nothing, and returns/logs the `wouldSend` list plus counts. Templates are disabled by default — enable one in Admin → Automation first, or the list will be empty.
2. In Admin → Automation use **Send test mail** on each template you are about to enable; it goes to the calling admin only and is not logged.
3. Set `LIFECYCLE_MAIL_ENABLED=true`, enable **one** template, and watch Admin → Automation → Verzendlog after the next 10:00 run. `lambda/wiedoethet-lifecycle/tests/force.json` (`{"force": true}`) runs it immediately (skips only the 10:00-hour guard; the weekend check still applies).
4. Enable the remaining templates one by one.

To stop everything at once set `LIFECYCLE_MAIL_ENABLED` to anything other than `true` (or disable the schedule). To stop a single mail, switch its template off in the admin panel.

### 6.7 Monitoring

- Alarm on the function's **Errors** metric (an unexpected exception is rethrown so it shows up there) — a run is idempotent, so the next slot recovers.
- Alarm on the SES **Bounce** and **Complaint** rates; sustained high rates put the whole SES account at risk. Complaints and opt-out requests arrive as replies in the reply mailbox.
- Log lines are JSON: `lifecycle-run` (summary with `sent`/`failed`/`skippedByCap`/`byTemplate`), `lifecycle-send-failed`, `lifecycle-misconfigured`, `lifecycle-run-failed`.
- A mail row stuck in status `sending` means the function died between claiming the row and getting the SES answer. It is deliberately never retried (one missed mail beats a duplicate); check whether the user got it before deleting the row.

### 6.8 Legal note

Lifecycle mails go to registered users who never ticked a marketing box. Under the Dutch Telecommunicatiewet art. 11.7, the "existing customer" exception (own similar products/services, a clear and free opt-out in every mail) is what makes this permissible — which is why every mail carries the opt-out footer and why opted-out users are excluded everywhere. This is an implementation note, not legal advice.

---

## Summary — manual steps checklist

- [ ] Verify sending identity (domain or single address) in SES Console
- [ ] Request production access to leave the SES sandbox
- [ ] Set `SES_FROM_EMAIL` and `SES_REPLY_TO_EMAIL` on `wiedoethet-admin`
- [ ] Attach `lambda/iam-policy-ses.json` to `wiedoethet-admin`'s execution role
- [ ] `npm install` in `lambda/`, then re-bundle and re-upload `wiedoethet-admin` (`npm run bundle:admin`)
- [ ] Re-import `openapi.yaml` into API Gateway to pick up the new `POST /admin/mail` route
- [ ] Fill in the reply address in `public/contact.md` (replace the flagged placeholder)
- [ ] Run the GSI3 backfill (`lambda/scripts/backfill-gsi3.js`) before enabling any lifecycle template
- [ ] Create `wiedoethet-lifecycle` (Node 24, `index.handler`), set its env vars (section 6.3), attach the DynamoDB + SES policies, then `npm run deploy:lifecycle`
- [ ] Create the EventBridge Scheduler schedule `cron(0 10 ? * MON-FRI *)` / `Europe/Amsterdam`, retries 0 (section 6.5)
- [ ] Dry-run (`tests/dry-run.json`), send test mails from Admin → Automation, then set `LIFECYCLE_MAIL_ENABLED=true` and enable templates one at a time
- [ ] CloudWatch alarms: lifecycle Errors, SES bounce/complaint rate
- [ ] `cd lambda && npm run deploy:admin` — deploys the admin code and wires the five new admin routes (mail templates, mail log, opt-out)
