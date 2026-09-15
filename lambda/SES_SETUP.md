# SES Setup — wieDoetHet

Supports the Admin Mail Users feature: `POST /admin/mail` on `wiedoethet-admin`, which sends an HTML email (subject + rich-text body) to one or many platform users. See `product/specs/admin-api.spec.md` for the full request/response contract.

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

Set on `wiedoethet-admin` only (no other function sends mail):

| Key | Value | Notes |
|---|---|---|
| `SES_FROM_EMAIL` | e.g. `noreply@wiedoethet.nl` | Must be a verified identity (Option A or B above) — `sendMail()` in `lambda/shared/ses.js` throws if this is unset, which surfaces as a 500 with every recipient in `failures[]` |

Set it the same way as the existing `TABLE_NAME`/`JWT_SECRET` variables: Lambda Console → `wiedoethet-admin` → **Configuration** → **Environment variables**.

---

## 4. IAM permissions

Attach `lambda/iam-policy-ses.json` to the `wiedoethet-admin` function's execution role (as an additional inline or managed policy — alongside the existing DynamoDB policy from `lambda/iam-policy-dynamodb.json`, do not replace it).

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

## Summary — manual steps checklist

- [ ] Verify sending identity (domain or single address) in SES Console
- [ ] Request production access to leave the SES sandbox
- [ ] Set `SES_FROM_EMAIL` on `wiedoethet-admin`
- [ ] Attach `lambda/iam-policy-ses.json` to `wiedoethet-admin`'s execution role
- [ ] `npm install` in `lambda/`, then re-bundle and re-upload `wiedoethet-admin` (`npm run bundle:admin`)
- [ ] Re-import `openapi.yaml` into API Gateway to pick up the new `POST /admin/mail` route
