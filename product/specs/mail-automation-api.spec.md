# Spec — Mail Automation (Backend: `wiedoethet-lifecycle` + admin endpoints)

**Status:** BUILT on `feature/mailAutomation` (2026-09-20). Verified with `npx vitest run lambda/` (67 tests, mocked DynamoDB/SES, fixed clock incl. DST) and the Cypress suite with stubbed API. **Not deployed / not run against AWS.** Deployed so far (2026-09-21): admin Lambda code + the six admin routes on the `development` stage, `SES_REPLY_TO_EMAIL` = `SES_FROM_EMAIL` on `wiedoethet-admin`. Still open: run the GSI3 backfill, create the `wiedoethet-lifecycle` Lambda + EventBridge Scheduler (see `lambda/SES_SETUP.md` § 6).
**Scope of this file:** backend only — the new scheduled `wiedoethet-lifecycle` Lambda, the new/extended `wiedoethet-admin` endpoints, DynamoDB items, shared modules, send-timing rules, the mail footer, opt-out, env vars, IAM, error handling. Frontend (admin panel screens, composables, i18n) is `product/specs/mail-automation.spec.md`. Entity shapes are mirrored in `product/data-model.md`.
**Branch:** `feature/mailAutomation`
**Last Updated:** 2026-09-20

---

## Purpose

Send a small set of automatic **lifecycle emails** to registered users to stimulate use of the product and prevent churn: help a new user reach "first group with tasks that people claimed", and win back users who went quiet. All mails are Dutch, sent through the SES setup that already powers `POST /admin/mail`, at moments chosen for the highest chance that people actually read them (see § Send Timing), and every mail carries a footer that (1) invites suggestions and (2) explains, very clearly, how to opt out. Users answer by simply replying to the mail — there is no self-serve unsubscribe page; the owner processes opt-outs manually through the Admin panel.

### Decisions carried in from the product discussion (final — do not re-litigate in build)

| # | Decision |
|---|---|
| D1 | Send at the moments people most check their mail — researched, see § Send Timing. Never a weekend. |
| D2 | `welcome`: send the day **after** registration; **suppress** if the user already created a group. |
| D3 | `no_group`: trigger = registration **+ 48 hours**. |
| D4 | `no_claims`: trigger = **4 days** (not 2) after tasks were added. |
| D5 | General rules: conditions are evaluated **at send time**; **one mail per user per period**; **stop when the user acts**; **stop after two unanswered win-back attempts**. |
| D6 | `User.mailOptOut` field + an Admin option to set it. Opted-out users receive no lifecycle mail. |
| D7 | **Every** mail has a non-editable footer: (a) open invitation to send improvement suggestions, (b) very clear "how to opt out" explanation. Both work by **replying to the mail**; the owner handles both manually. |
| D8 | v1 scope: `welcome`, `no_group`, `no_tasks`, `no_claims` ("stuck in funnel"), `day_after_event`, `dormant_30`, `dormant_60`. **Deferred:** #5 event-approaching reminder, #6 all-tasks-claimed celebration. |
| D9 | Admin panel: per-template on/off toggle, sent-mail log, per-template text proposal that the admin can edit (and reset). |

### Assumptions made by this spec (need a yes/no in review)

| # | Assumption | Why |
|---|---|---|
| A1 | `no_group` is **exempt from the 72 h minimum gap after `welcome`** (they land ~24–48 h apart because D2 and D3 are specified that way). No other pair is exempt. | D2 + D3 as stated collide with any sane frequency cap. |
| A2 | "Combined #3/#4" is implemented as **one shared funnel evaluator, two templates** (`no_tasks`, `no_claims`) — the triggers (24 h vs 4 days) and the message differ. A group is in exactly one funnel stage at a time. | Different trigger + different call-to-action. |
| A3 | Two dormant templates (`dormant_30`, `dormant_60`), then **sunset** (no third attempt). Satisfies "stop after two unanswered win-back attempts". | D5 |
| A4 | `maxPerUser` = 1 for every template except `day_after_event` (once **per group**, deduped by group id). Lifetime, not per year. | Simplest safe default. |
| A5 | Manual `POST /admin/mail` **also skips opted-out users** and reports `skippedOptOut`. | An opt-out that only applies to some mail is not an opt-out. |
| A6 | Admin accounts (`role: 'admin'`) never receive lifecycle mail. | Internal/test accounts. |
| A7 | One send slot per weekday at **10:00 Europe/Amsterdam**. | § Send Timing. A second 20:00 slot is a later A/B test, not v1. |
| A8 | A "Testmail naar mezelf" endpoint exists (sends the rendered template to the calling admin only, not logged). | Templates default to disabled; the admin needs a way to see the final mail (with footer) before enabling. Cheap to drop if unwanted. |

---

## Send Timing (research basis)

The instruction was to always send at the days/times people check email most. Conclusion of the research (sources below):

- **Weekday matters little** — most studies put the spread between best and worst weekday at under ~2 percentage points. Tuesday/Wednesday/Thursday are consistently top or near-top; Monday is fine; **weekends are the weakest** for this audience and are never used.
- **Hour matters more.** Opens peak in the **late morning, ~09:00–11:00 local time (10:00 is the most frequently cited single peak)**. A secondary peak exists in the evening (~20:00–21:00) where *clicks* are strongest, and Dutch consumer sources also name early morning (07:00–09:00), lunch, and 16:00–17:00.
- **Caveats:** the data is dominated by international marketing newsletters, not transactional/lifecycle mail for a small Dutch app; open rates are inflated by Apple Mail Privacy Protection, so **clicks are the metric to learn from**. Treat 10:00 as a strong default and validate with the log + a later A/B test.

**Resulting design (single rule set, applied by the scheduler and re-checked by the Lambda):**

| Rule | Value |
|---|---|
| Send slot | **10:00 Europe/Amsterdam** (DST-correct — the scheduler carries the timezone, the code never hard-codes a UTC offset) |
| Allowed days | **Mon–Fri only**. No weekends, ever. |
| Urgency tier `timely` | Mon–Fri — for mails whose value decays quickly (`welcome`, `no_tasks`, `day_after_event`). A trigger that falls on a weekend goes out the next Monday 10:00. |
| Urgency tier `normal` | **Tue / Wed / Thu only** — for nudges that are not time-critical (`no_group`, `no_claims`, `dormant_*`). A trigger that falls on Fri/Sat/Sun/Mon goes out the next Tue–Thu 10:00. |
| Expiry | Every template has `maxAgeHours` measured from its trigger moment (`eligibleAt`). A mail that could not be sent in that window (weekend, cap, outage) is **dropped, not sent late**. `null` = never expires (only `dormant_*`, where the condition itself stays true). |
| Cap | At most `LIFECYCLE_MAX_SENDS_PER_RUN` (default **50**) mails per run, concurrency 5. Over-cap candidates simply wait for the next slot (until they expire). |

Sources: [MailerLite — best time to send email](https://www.mailerlite.com/blog/best-time-to-send-email), [Omnisend](https://www.omnisend.com/blog/best-time-to-send-email/), [Mailjet](https://www.mailjet.com/blog/email-best-practices/best-time-to-send-email-newsletters/), [OptinMonster](https://optinmonster.com/the-best-time-to-send-emails-heres-what-studies-show/), [Brevo benchmarks](https://www.brevo.com/blog/email-marketing-benchmarks/), [TransIP (NL)](https://www.transip.nl/blog/beste-tijd-nieuwsbrief-versturen/), [Marqetinge (NL)](https://www.marqetinge.nl/2026/07/03/wanneer-moet-ik-mijn-nieuwsbrief-versturen/) (the last one could not be fetched directly — cited via a search summary only).

---

## Function Purpose — `wiedoethet-lifecycle`

A new Lambda, **not** behind API Gateway. Invoked by **EventBridge Scheduler** on the schedule below. It finds users who hit a lifecycle trigger, re-checks the condition against current data, and sends each due mail exactly once.

| | |
|---|---|
| Directory | `lambda/wiedoethet-lifecycle/` (`index.js` handler + `evaluators.js` + `tests/`) |
| Handler | `index.handler` |
| Runtime | Node.js 24, ESM source, esbuild → CJS bundle (`bundle:lifecycle`, added to the aggregate `bundle` script) like the other four functions |
| Deploy | `lambda/scripts/deploy-lifecycle.js` modelled on `deploy-admin.js` (manual zip, no IaC — same "Deployment Reality" as the rest of the repo) |
| Timeout / memory | 5 min / 256 MB |
| Trigger | EventBridge Scheduler: `cron(0 10 ? * MON-FRI *)`, **timezone `Europe/Amsterdam`**, flexible window **off** |
| Retries | Scheduler retry policy: max 0 (the Lambda has its own idempotency + retry-on-next-run; an automatic immediate retry could double-send) |

### Event shape

```js
{}                          // scheduled run (normal)
{ dryRun: true }            // evaluate everything, write nothing, send nothing, log what WOULD be sent. Allowed at any time. Use for pre-launch verification.
{ force: true }             // bypass the "inside the 10:00 hour" guard for a real run (manual recovery). Does NOT bypass the weekday rules or the master switch.
```

### Run algorithm

```
1. killSwitch = process.env.LIFECYCLE_MAIL_ENABLED === 'false'        // emergency override, exactly 'false'
   master = killSwitch ? null : getItem(MAILSTATE#lifecycle / MASTER)  // toggled from the admin panel
   masterEnabled = !killSwitch && master?.enabled === true             // absent / unreadable ⇒ off (fail closed)
   write MAILSTATE#lifecycle / LASTRUN { at, masterEnabled, killSwitch, dryRun }    // always — the admin panel shows it
   if !masterEnabled and !dryRun → return { skipped: 'master-switch-off' }
2. localNow = Europe/Amsterdam wall-clock (Intl.DateTimeFormat, no offset math)
   if !force and !dryRun and localNow.hour !== 10 → return { skipped: 'outside-send-window' }
   if localNow is Sat/Sun → return { skipped: 'weekend' }
3. templates = getAllTemplateConfigs()                 // 7 CONFIG items, missing item = { enabled:false }
   activeTiers = Tue/Wed/Thu ? {timely, normal} : {timely}
   for each template in PRIORITY ORDER, if enabled && tier ∈ activeTiers:
       for each candidate of template.candidates(ctx):         // see § Templates
           eligibleAt <= now                                   else skip
           maxAgeHours == null || now - eligibleAt <= maxAge   else skip (expired)
           user = candidate.user; skip if user.role==='admin' || user.mailOptOut === true
           skip if user already picked in THIS run             // one mail per user per run
           skip if log row exists and is not retryable         // exactly-once (see § Idempotency)
           skip if per-user lifetime count(templateId) >= maxPerUser
           skip if minimum gap violated                        // any lifecycle mail sent/sending in last 72h, except template.gapExemptAfter
           skip if !(await template.stillApplies(ctx, candidate))   // send-time re-check (D5)
           push to sendList
           stop when sendList.length >= LIFECYCLE_MAX_SENDS_PER_RUN
4. for each item of sendList (concurrency 5): renderAndSend(item)   // see § Idempotency
5. update MAILSTATE#lifecycle / LASTRUN { evaluated, sent, failed, skippedByCap }
   return the same summary (CloudWatch log line, one JSON object)
```

`PRIORITY ORDER`: `welcome`, `no_group`, `no_tasks`, `no_claims`, `day_after_event`, `dormant_30`, `dormant_60`. It only matters for the "one mail per user per run" rule: the earlier template wins that slot.

**Minimum gap:** 72 hours between any two lifecycle mails to the same user. Manual admin mails do not count (they are not logged as lifecycle mail).

### Templates

Definitions live in **`lambda/shared/lifecycle-templates.js`** (code, not DynamoDB, so the default text is version-controlled and the admin Lambda can show it): one exported array of

```js
{
  id, scope: 'user' | 'group', tier: 'timely' | 'normal',
  maxAgeHours, maxPerUser, gapExemptAfter: string[],
  variables: string[],              // placeholders allowed in subject/body, see § Placeholders
  defaultSubject, defaultBodyHtml,  // the "text proposal" (Dutch) — see § Default texts
}
```
`candidates(ctx)` (async generator of `{ user, group?, eligibleAt }`) and `stillApplies(ctx, candidate)` live in `wiedoethet-lifecycle/evaluators.js`, keyed by template id; the admin Lambda imports only the static fields above, so it never pulls in the DynamoDB evaluator code.

| id | scope | tier | trigger `eligibleAt` | `maxAgeHours` | `maxPerUser` | Send-time condition (`stillApplies`) |
|---|---|---|---|---|---|---|
| `welcome` | user | timely | **start of the calendar day after registration** (Amsterdam local midnight following `createdAt`'s local date) | 96 | 1 | User has **zero groups** at send time. (D2's "created a group on day 1" is a subset of this: any group before the send moment suppresses the welcome.) |
| `no_group` | user | normal | `createdAt` **+ 48 h** | 168 | 1 | User has **zero groups**. `gapExemptAfter: ['welcome']` (A1). |
| `no_tasks` | group | timely | `group.createdAt` **+ 24 h** | 96 | 1 | Group still exists, has **zero tasks**, and `eventDate` is null or not in the past. |
| `no_claims` | group | normal | **earliest task `createdAt`** in the group **+ 96 h** (4 days, D4) | 168 | 1 | Group has **≥ 1 task and zero claims** across all its tasks, and `eventDate` is null or not in the past. |
| `day_after_event` | group | timely | **start of the day after `eventDate`** (Amsterdam local midnight) | 96 | once per group | Group has **≥ 1 claim** (a real event, not an empty shell). Skipped when `eventDate` is null. |
| `dormant_30` | user | normal | `max(lastActivityAt + 30 d, template.enabledAt)` | `null` | 1 | `lastActivityAt` is still ≤ now − 30 d (no activity since the trigger was computed). |
| `dormant_60` | user | normal | `max(lastActivityAt + 60 d, template.enabledAt)` | `null` | 1 | `dormant_30` was **sent** to this user AND `lastActivityAt` ≤ now − 60 d AND no activity since `dormant_30.sentAt`. |

**Shared funnel evaluator (A2):** `no_tasks` and `no_claims` both call `funnelStage(group)` → `'no_tasks' | 'no_claims' | 'done'`. A group is evaluated only for the stage it is currently in, so a group can never be picked for both, and once it is `'done'` (has claimed tasks) neither fires — "stop when the user acts".

**Recipient for group-scoped templates:** the group's initiator (`group.initiatorId` → `User`). Anonymous participants are never emailed (no address exists for them).

**`lastActivityAt`** (used by `dormant_*`) = `max(user.lastSeenAt ?? user.createdAt, newest group.createdAt of that initiator)`. It intentionally does not include claims (not indexed by user — see `admin-api.spec.md` Known Limitations). See § `lastSeenAt` for how the field is maintained.

**`template.enabledAt`:** set by the admin API when a template flips from disabled → enabled. It floors the `dormant_*` trigger so that switching the template on does not instantly fire for every long-dormant legacy user; those users are instead drip-fed by the per-run cap (50/day). All other templates are protected against legacy backlogs by `maxAgeHours`.

**Candidate discovery** uses only existing indexes — no new GSI:

| Templates | Source |
|---|---|
| `welcome`, `no_group` | GSI3 `USER`, `scanIndexForward: false`, `skGte` = now − (lead + `maxAgeHours`), stop paging once past the lower bound |
| `no_tasks` | GSI3 `GROUP`, same technique |
| `no_claims` | GSI3 `GROUP` created within the last **30 days** (`FUNNEL_LOOKBACK_DAYS`), then tasks (`PK=GROUP#id`, `SK begins_with TASK#`) per group |
| `day_after_event` | GSI3 `GROUP` created within the last **180 days** (`EVENT_LOOKBACK_DAYS`), filtered on `eventDate === yesterday` |
| `dormant_*` | GSI3 `USER` oldest-first, pre-filtered on the user item's own `lastSeenAt ?? createdAt`; the per-user GSI2 group lookup runs only for users that pass the pre-filter |

Each source is bounded by `MAX_CANDIDATES_EVALUATED` (default 2000 per run). Hitting the bound logs a `WARN` line — see Known Limitations. **Prerequisite:** legacy users/groups are absent from GSI3 until `lambda/scripts/backfill-gsi3.js` (backlog ADM-07) has run; run it before enabling any template.

### Placeholders

Subject and body support `{{name}}`-style tokens. Allowed per template (the admin API rejects anything else with `400`):

| Token | Meaning | Available in |
|---|---|---|
| `{{firstName}}` | First word of `user.name`, HTML-escaped; falls back to `"daar"` ("Hoi daar,") when empty | all |
| `{{appUrl}}` | `APP_URL` env (e.g. `https://wiedoethet.nl`) | all |
| `{{createGroupUrl}}` | `{APP_URL}/groups/new` (verify the route at build time) | all |
| `{{groupName}}` | HTML-escaped `group.name` | `no_tasks`, `no_claims`, `day_after_event` |
| `{{groupUrl}}` | `{APP_URL}/groups/{id}` (initiator's group page; verify at build time) | `no_tasks`, `no_claims`, `day_after_event` |

Substitution is a plain regex replace on `{{token}}` after validation; every substituted value is HTML-escaped (in the subject: plain text, no HTML). No template engine, no logic, no partials. Implemented in `lambda/shared/mail-render.js`.

### Default texts ("text proposal")

The default subject/body for each template is defined next to the template in `lifecycle-templates.js`. The **exact Dutch proposals** are part of this spec's review so the owner can veto tone/wording before build — see **Appendix A**. The admin can override subject and body per template; a null override means "use the default" and the admin panel's "Terug naar standaardtekst" simply clears the override.

### Footer (all mails — lifecycle, manual, test)

Implemented once, in `lambda/shared/email-template.js` → `wrapEmailHtml(bodyHtml, { replyToEmail })`, so it is impossible to send a branded mail without it. It is **not editable** in the admin panel and is **appended after** the (editable) body, above the existing "Dit bericht is verstuurd via wiedoethet.nl" line.

Two visually separated blocks, Dutch, plain language, ≥ 14 px, links underlined:

```
Ideeën om Wie-Doet-Het beter te maken?
Laat het ons weten! Antwoord gewoon op deze e-mail met je suggestie — we lezen elk bericht.

Geen e-mails meer van ons?
Antwoord op deze e-mail met het woord "afmelden" (of mail naar {replyToEmail}).
Wij zetten je dan uit onze mailinglijst — binnen 2 werkdagen. Meer hoef je niet te doen.
```
- `{replyToEmail}` is rendered as a `mailto:` link **and** as visible text.
- "binnen 2 werkdagen" is a **commitment the owner must be able to keep** — flagged in review; the number is one constant (`OPT_OUT_PROCESSING_TEXT`) so it is a one-line change.
- Footer applies to manual `POST /admin/mail` mails as well (they go through the same `wrapEmailHtml`).

### `lambda/shared/ses.js` change

`sendMail({ to, subject, html, replyTo })`: adds `ReplyToAddresses: [replyTo]` to the `SendEmailCommand` (`replyTo` defaults to `process.env.SES_REPLY_TO_EMAIL`). **`sendMail` throws if no reply-to address resolves** — replies to the noreply `From` would be lost, and the footer promises they are read. This is a deliberate hard failure (fail closed).

### Idempotency, retries and the log (exactly-once)

Every attempted send is recorded in a **mail log item**. The log item's key is deterministic, so a conditional write is the lock:

```
PK = USER#{userId}
SK = MAIL#{templateId}#{scopeId}          // scopeId = groupId for group-scoped templates, "-" for user-scoped
```

Send procedure for one candidate:
1. `putItem` the log item with `ConditionExpression: attribute_not_exists(PK)` and `status: 'sending'`, `attempts: 1`. If the condition fails, **do not send**: the mail is being/was handled (unless the existing row is `failed` with `attempts < 3` → step 3).
2. Call `sendMail(...)`.
3. Retry path (existing row `status = 'failed'`, `attempts < 3`, still inside the expiry window): `updateItem` `SET status='sending', attempts = attempts + 1` with `ConditionExpression: status = 'failed' AND attempts = :seen` (a second concurrent run loses the race and skips), then step 2.
4. On success: `SET status='sent', sentAt, sesMessageId`. On error: `SET status='failed', errorMessage` (truncated to 500 chars). A `failed` row is retried on the next eligible run, max **3 attempts** in total, then it stays `failed` for good.
5. A row stuck at `status='sending'` (Lambda died between step 2 and 4) is **never retried** — the design is **at-most-once**: an occasional missed mail is preferred over a duplicate. It shows up as "Bezig" in the log; the admin can spot it (see Known Limitations).

Log item attributes:

```js
{
  PK, SK,
  GSI3PK: 'MAILLOG', GSI3SK: `${createdAt}#${userId}#${templateId}`,   // admin log listing, newest-first
  id: `${templateId}:${userId}:${scopeId}`,
  type: 'MAILLOG',
  templateId, userId, email, userName,           // email/name are a snapshot for the log
  groupId: string | null, groupName: string | null,
  subject,                                       // the rendered subject actually sent
  status: 'sending' | 'sent' | 'failed',
  attempts: number,
  errorMessage: string | null,
  sesMessageId: string | null,
  createdAt, sentAt: string | null,
}
```
The rendered body is deliberately **not** stored (size, and it is derivable from the template + variables).

### `lastSeenAt` (User attribute, maintained by existing Lambdas)

`dormant_*` needs "when did this user last use the product". Add `User.lastSeenAt` (ISO 8601), set by a shared helper `touchLastSeen(user)` in `lambda/shared/db.js`, called from:
- `wiedoethet-auth` `POST /auth/login` and `GET /auth/me`
- `wiedoethet-groups` `GET /groups` (the dashboard load — the entry point of a returning session; sessions last up to 30 days on the JWT alone, so `login` alone would under-report activity)

The helper is a **throttled, fire-and-forget conditional update**: only writes when `lastSeenAt` is missing or older than 24 h (`attribute_not_exists(lastSeenAt) OR lastSeenAt < :cutoff`), swallows every error (a failed touch must never fail the request), and nothing the response depends on awaits it. Cost: at most one small write per user per day.

---

## Admin API changes (`lambda/wiedoethet-admin/index.js`)

All routes are behind the existing `requireAdmin` (401/403 semantics unchanged — see `admin-api.spec.md`). New rows in the router's if-chain, same style as existing routes. CORS/OPTIONS handling unchanged.

### `GET /admin/mail-templates`

Returns all seven templates in `PRIORITY ORDER` (built from the code definitions merged with each CONFIG item, so a template that has never been configured still appears, `enabled: false`).

```js
{
  items: [{
    id: 'welcome',
    scope: 'user' | 'group',
    tier: 'timely' | 'normal',            // frontend maps this to "Ma–vr" / "Di–do"
    enabled: boolean,
    subject: string,                      // effective subject (override ?? default)
    bodyHtml: string,                     // effective body    (override ?? default)
    defaultSubject: string,
    defaultBodyHtml: string,
    isCustomised: boolean,                // an override is stored
    variables: string[],                  // e.g. ['firstName','appUrl','createGroupUrl']
    updatedAt: string | null,
    updatedBy: string | null,             // admin user id
  }],
  lastRun: { at, masterEnabled, killSwitch, dryRun, evaluated, sent, failed, skippedByCap } | null,
  master: { enabled: boolean, updatedAt: string | null, updatedBy: string | null },   // absent item ⇒ { enabled:false, updatedAt:null, updatedBy:null }
}
```
Name/description/trigger copy is **not** returned — it is i18n on the frontend, keyed by `id` (both `nl.json` and `en.json`). Only the email text itself is server-owned (mails are always Dutch).

### `PATCH /admin/mail-templates/{templateId}`

Partial update. Body — any subset of:
```js
{ enabled?: boolean, subject?: string | null, bodyHtml?: string | null }
```
- `null` for `subject`/`bodyHtml` **clears the override** (revert to default). A string sets it.
- Validation → `400`:
  - unknown `templateId` → `404`
  - `enabled` present and not boolean
  - `subject`: a string must be non-empty after trim and ≤ 150 chars
  - `bodyHtml`: a string must be non-empty after trim and not just an empty Tiptap paragraph (`<p></p>`); ≤ 50 000 chars
  - any `{{token}}` not in that template's `variables` → message lists the offending tokens: `Onbekend of niet toegestaan veld: {{groupName}}`
  - empty body (`{}`) → `400`
- Flipping `enabled` from `false` → `true` sets `enabledAt = now` (see `dormant_*`); `true` → `false` leaves it.
- Writes the CONFIG item (`PK=MAILTPL#{id}`, `SK=CONFIG`) with `enabled, subject, bodyHtml, enabledAt, updatedAt, updatedBy` (`updateItem`, creating it on first touch). Returns the updated template in the same shape as one `items[]` entry.
- Admin HTML is stored as-is (admins are trusted; the manual mail endpoint already does the same). The only escaping is of substituted *values*.

### `PATCH /admin/mail-master`

Switches the lifecycle-mail master switch. Body: `{ enabled: boolean }` — anything else (missing, string, number) → `400` `badRequest('enabled moet true of false zijn')`, nothing written. Writes the MASTER item (`PK=MAILSTATE#lifecycle`, `SK=MASTER`) with `enabled, updatedAt, updatedBy` (`updateItem`, creating it on first touch) and returns `{ enabled, updatedAt, updatedBy }`. It never touches `LASTRUN`, and it does not change any template's own toggle. The lifecycle Lambda reads the item at the start of every run, so a switch made now takes effect at the next run (Mon–Fri 10:00) — there is no immediate send.

### `POST /admin/mail-templates/{templateId}/test` (A8)

Renders the template (effective subject/body) with sample values (`firstName` = the caller's first name, `groupName` = "Voorbeeldgroep", URLs from `APP_URL`), wraps it in the branded shell **including the footer**, prefixes the subject with `[TEST] `, and sends it to **the calling admin's own address only**. Not written to the mail log. Response `{ sent: true, to: string }`; SES failure → `502` with `{ message }`.

### `GET /admin/mail-log`

Newest-first, cursor-paginated (same base64url cursor encoding as `/admin/users`; `limit` 1–50, default 20).

| Query param | Meaning |
|---|---|
| `templateId` | exact match on `templateId` |
| `status` | `sent` \| `failed` \| `sending` |
| `q` | case-insensitive substring of recipient email |
| `limit`, `cursor` | as above |

Source: `queryGsi3('MAILLOG', { scanIndexForward: false, filterExpression, ... })`, following the helper's documented "loop on `lastEvaluatedKey` — FilterExpression applies after the read" contract until `limit` items are collected or the index is exhausted. Response:
```js
{ items: [MailLogEntry], nextCursor: string | null }
// MailLogEntry = the log item above minus PK/SK/GSI3*/type
```
Invalid `templateId`/`status` → `400`.

### `PATCH /admin/users/{userId}/mail-opt-out`

Body `{ optOut: boolean }` (required, boolean, else `400`). Unknown user → `404`. Sets `mailOptOut`, `mailOptOutAt` (now when `true`, `null` when `false`), `mailOptOutBy` (admin id). Idempotent. Response `{ id, mailOptOut, mailOptOutAt }`.

### Existing endpoints that change

- `GET /admin/users` rows and `GET /admin/users/{id}` gain `mailOptOut: boolean` (absent attribute ⇒ `false`); the detail additionally gains `mailOptOutAt: string | null` and `lastSeenAt: string | null`.
- `POST /admin/mail` (A5): recipients with `mailOptOut === true` are removed **after** recipient resolution and **before** the `MAX_MAIL_RECIPIENTS` check on the *sendable* set. Response gains `skippedOptOut: number` (0 when none). If the sendable set is empty because everyone opted out, the response is `200 { sent: 0, failed: 0, failures: [], skippedOptOut: n }` (not a `400`). The `wrapEmailHtml` footer applies (see above). `SES_REPLY_TO_EMAIL` becomes required for this route.
- `openapi.yaml`: document the five new operations, the two response-field additions, and the new schemas (`MailTemplate`, `MailLogEntry`, `MailTemplatePatch`).

---

## DynamoDB Integration (for `lambda/DYNAMODB_SETUP.md`)

**No new table, no new GSI.** New item types in `wdh-main`:

| Item | PK | SK | Notes |
|---|---|---|---|
| Template config | `MAILTPL#{templateId}` | `CONFIG` | `{ enabled, subject\|null, bodyHtml\|null, enabledAt\|null, updatedAt, updatedBy }`. Absent ⇒ disabled, default text. Not in GSI3. |
| Mail log | `USER#{userId}` | `MAIL#{templateId}#{scopeId}` | See § Idempotency. In GSI3 under the constant partition `MAILLOG`. |
| Last-run state | `MAILSTATE#lifecycle` | `LASTRUN` | Single item, overwritten every run. |
| Master switch | `MAILSTATE#lifecycle` | `MASTER` | `{ enabled, updatedAt, updatedBy }`. Absent ⇒ off. Separate from `LASTRUN` so the run's write cannot clobber it. Per table: `wdh-dev` and `wdh-main` are independent. |

Impacts to verify at build time:
- `GSI3PK='MAILLOG'` items must **not** be counted by the stats queries (`GSI3PK='USER'` / `'GROUP'` are separate partitions — no overlap).
- Any existing `queryByPk('USER#{id}')` that does not pass an `SK` prefix would now also return `MAIL#…` rows. Grep every caller of `queryByPk` with a `USER#` PK during build; `getItem(USER#id, 'PROFILE')` is unaffected.
- New key builders in `lambda/shared/db.js`: `keys.mailTemplate(id)`, `keys.mailLog(userId, templateId, scopeId)`, `keys.mailLogGsi3(createdAt, userId, templateId)`, `keys.mailState()`, `keys.mailMaster()`.
- New helpers in `lambda/shared/db.js`: `putItemIfAbsent(item)` (conditional put returning `false` on `ConditionalCheckFailedException`), `updateItemIf(pk, sk, updates, condition, values)`, `touchLastSeen(user)`.

## Environment Variables

| Variable | Function(s) | Required | Notes |
|---|---|---|---|
| `TABLE_NAME` | lifecycle | No | same fallback pattern as the other functions |
| `SES_FROM_EMAIL` | lifecycle, admin | Yes | unchanged (noreply) |
| `SES_REPLY_TO_EMAIL` | lifecycle, admin | **Yes** | The **monitored** mailbox. Footer promises replies are read. `sendMail` throws without it. **Owner must create/choose this mailbox before enabling anything** — there is currently no public address anywhere on the site. |
| `APP_URL` | lifecycle, admin | Yes | e.g. `https://wiedoethet.nl`; used in placeholders |
| `LIFECYCLE_MAIL_ENABLED` | lifecycle | No | **Emergency stop only.** The exact string `'false'` forces the master switch off regardless of the flag in the table (recorded as `LASTRUN.killSwitch`). Unset, `'true'` or anything else defers to the master switch in the table, which is what the admin toggles. Set it to `false` in the Lambda console to stop everything even if the admin panel or API is unavailable. |
| `LIFECYCLE_MAX_SENDS_PER_RUN` | lifecycle | No | default `50` |
| `JWT_SECRET` | admin | Yes | unchanged (the lifecycle Lambda does not verify JWTs and does not need it) |

## IAM Permissions

- **`wiedoethet-lifecycle` execution role:** the shared `lambda/iam-policy-dynamodb.json` (already grants `GetItem/PutItem/UpdateItem/Query` on the table and GSI1–3 — verify no change needed) + `lambda/iam-policy-ses.json` (`ses:SendEmail`, already region/identity-scoped) + the standard basic-execution/CloudWatch Logs policy.
- **EventBridge Scheduler:** a scheduler execution role permitted `lambda:InvokeFunction` on `wiedoethet-lifecycle` (created by `lambda/scripts/setup-lifecycle.js`, run once via `npm run setup:lifecycle`; documented in `lambda/SES_SETUP.md`'s "Lifecycle mail" section).
- **SES:** if the account is still in the SES sandbox, recipients must be verified — production access is a prerequisite for real users (see `SES_SETUP.md`). The `Reply-To` mailbox does **not** need SES verification (it is a normal inbox), but the **From** identity's domain should have SPF/DKIM/DMARC aligned (re-verify the DMARC policy before the first send).

## Error Handling

| Scenario | Behaviour |
|---|---|
| `PATCH /admin/mail-templates/{id}` — unknown id | `404` `notFound()` |
| Invalid body / unknown placeholder / over-length | `400` `badRequest()` with a Dutch, human-readable message |
| `POST …/test` — SES failure | `502` `{ message }` |
| `GET /admin/mail-log` — bad `templateId`/`status`/`limit`/`cursor` | `400` |
| `PATCH /admin/users/{id}/mail-opt-out` — non-boolean `optOut` | `400`; unknown user `404` |
| Lifecycle run — single send throws | Logged in the mail item (`failed`), run continues; never aborts the batch |
| Lifecycle run — DynamoDB throws while discovering candidates | Log `ERROR`, abort that template only, continue with the next; run still writes `LASTRUN` |
| Lifecycle run — `SES_REPLY_TO_EMAIL`/`SES_FROM_EMAIL` missing | Abort the run before any send (`sendMail` guard), `ERROR` log line |
| `PATCH /admin/mail-master` — non-boolean `enabled` | `400`; nothing written |
| Master switch off, never set, or unreadable (DynamoDB error) | Run is a no-op (fail closed); `LASTRUN.masterEnabled=false` so the admin UI can show why nothing is sent. A read error is logged as `WARN lifecycle-master-read-failed` |
| `LIFECYCLE_MAIL_ENABLED=false` on the Lambda | Same as off, whatever the table says; `LASTRUN.killSwitch=true` so the admin UI can warn that the switch is overridden |

## Performance

- Discovery is index-based (GSI3 range + per-candidate keyed lookups). At the current scale (hundreds of users) a run touches well under a few thousand items. A run is bounded by `MAX_CANDIDATES_EVALUATED` (2000) and the send cap (50) — a run cannot run away.
- SES rate: 50 mails per run at concurrency 5 is far under any SES limit.

## Monitoring

- One structured JSON log line per run (`{ event:'lifecycle-run', evaluated, sent, failed, skippedByCap, dryRun }`) + one per send failure. A CloudWatch metric filter/alarm on `ERROR`, and on "no `lifecycle-run` line on a weekday by 11:00", is a recommended manual setup step (documented, not automated — no IaC in this repo).
- The admin **Verzendlog** is the day-to-day monitor; `lastRun` on the templates page shows the last execution and whether the master switch was on.

---

## Related Changes (documentation + code outside the new Lambda)

| File | Change |
|---|---|
| `product/data-model.md` | `User.mailOptOut/mailOptOutAt/mailOptOutBy/lastSeenAt`; entities `MailTemplateConfig`, `MailLogEntry`; `AdminUserSummary/Detail` fields; new rows in the endpoint map. **Updated together with this spec.** |
| `public/privacy.md` (Dutch, **no API/backend details** — public agent-facing file rule) | Replace "…niet gebruikt voor nieuwsbrieven." with an honest description: e-mail is also used for a few automatic service mails (welcome, tips for getting started, occasional reminder when inactive); every mail explains how to opt out by replying; stored fields now include the opt-out flag and the moment of last visit. See Appendix B. |
| `public/contact.md` (Dutch) | Add the monitored mailbox and: suggestions welcome, opt-out = reply "afmelden". See Appendix B. |
| `public/sitemap.xml` | Bump the `lastmod` of `/privacy` and `/contact` (the privacy page itself says the date is updated on changes). |
| `lambda/DYNAMODB_SETUP.md` | New "Mail automation items" section (the four item types incl. the master switch, `MAILLOG` GSI3 partition). |
| `lambda/SES_SETUP.md` | New "Lifecycle mail" section: `SES_REPLY_TO_EMAIL`, scheduler setup, IAM, production access, DMARC check, kill switch. |
| `lambda/package.json` | `bundle:lifecycle`, `deploy:lifecycle`; add to aggregate `bundle`. |
| `lambda/wiedoethet-auth`, `wiedoethet-groups` | `touchLastSeen` calls (see § `lastSeenAt`). |
| `lambda/shared/email-template.js`, `ses.js` | Footer + `Reply-To` (above). |
| `openapi.yaml` | See § Admin API changes. |
| `product/product-overview.md` | Add "Mail automation" to the Admin/feature list once built. |

Legal note (not legal advice — owner to confirm): mailing your own registered users about the same service, with a clear opt-out in every message, is generally covered by the existing-customer exemption in the Dutch Telecommunicatiewet (art. 11.7). The opt-out promise in the footer must therefore be honoured reliably; the 2-working-day text and the mailbox being monitored are the operational obligations that come with it. Also note GDPR: the opt-out flag and `lastSeenAt` are personal data → covered by the privacy-page update.

---

## Acceptance Criteria

**Timing & scheduling**
- [x] The Lambda sends nothing when the master switch item is absent, `enabled: false` or unreadable, or when `LIFECYCLE_MAIL_ENABLED` is exactly `'false'`, and records `LASTRUN.masterEnabled = false` (and `killSwitch`).
- [x] The Lambda sends nothing on Saturday/Sunday, and nothing outside the 10:00 Amsterdam hour unless `force`/`dryRun`.
- [x] `normal`-tier templates send only Tue/Wed/Thu; `timely`-tier Mon–Fri. Verified with a fixed clock across a DST boundary (last Sunday of March/October).
- [x] A trigger that falls on a weekend is delivered the next allowed slot; one older than `maxAgeHours` is dropped.
- [x] A run never sends more than `LIFECYCLE_MAX_SENDS_PER_RUN`.

**Rules**
- [x] `welcome`: sent on the day after registration, **not** sent when the user already has a group.
- [x] `no_group`: eligible exactly 48 h after registration; not sent once the user has a group; exempt from the 72 h gap only after `welcome`.
- [x] `no_tasks` / `no_claims`: a group in stage `no_tasks` never gets `no_claims` and vice versa; `no_claims` triggers 96 h after the first task; neither fires after the event date has passed or once the group is `done`.
- [x] `day_after_event`: once per group, only when the group had ≥ 1 claim.
- [x] `dormant_30` then `dormant_60`, each at most once per user; `dormant_60` only after a sent `dormant_30` with no activity since; **no further lifecycle mail after `dormant_60`**.
- [x] Enabling `dormant_*` on a database with many legacy dormant users sends at most 50 per run.
- [x] Conditions are evaluated at send time: a user who created a group between trigger and send gets nothing.
- [x] At most one lifecycle mail per user per run; ≥ 72 h between any two (except A1).
- [x] Opted-out users and admins never receive a lifecycle mail; opted-out users are also skipped by `POST /admin/mail` (`skippedOptOut` reported).

**Exactly-once / resilience**
- [x] Two concurrent runs never send the same (user, template, scope) twice (conditional put).
- [x] A failed send is retried on later runs, max 3 attempts, then left `failed`.
- [x] A `sending` row is never retried.
- [x] A failed touch of `lastSeenAt` never fails the request; writes are throttled to once per 24 h.

**Mail content**
- [x] Every mail (lifecycle, manual, test) contains the suggestions block and the opt-out block **and** a `Reply-To` header set to `SES_REPLY_TO_EMAIL`; `sendMail` throws without it.
- [x] Unknown/unauthorised placeholders are rejected on save; substituted values are HTML-escaped.

**Admin API**
- [x] All new routes (including `PATCH /admin/mail-master`) reject non-admins (401/403) and behave per § Admin API changes; `PATCH` `enabled: true` sets `enabledAt`; `null` overrides reset to default.
- [x] `GET /admin/mail-log` paginates newest-first and filters by template/status/email.
- [x] `openapi.yaml`, `DYNAMODB_SETUP.md`, `SES_SETUP.md`, `data-model.md`, `privacy.md`, `contact.md` updated.
- [x] Lambda test-event JSON files added under `lambda/wiedoethet-admin/tests/` (same format as `mail-users.json`) and `lambda/wiedoethet-lifecycle/tests/` (`dry-run.json`, `scheduled.json`), plus unit tests for the evaluators with an injectable clock.

## Known Limitations

- **No self-serve unsubscribe.** By decision (D7). The opt-out is only as fast as the owner's mailbox handling. A one-click `List-Unsubscribe` header is not implemented (needs SESv2 or raw MIME); not legally required at this volume, worth revisiting if volume grows.
- **`lastSeenAt` is approximate** (≤ 24 h granularity, only seen via login, `/auth/me`, `GET /groups`). A user who only ever interacts through share links can look dormant.
- **Discovery is bounded, not indexed by trigger time.** `day_after_event` and `dormant_*` scan a bounded window of GSI3. Beyond ~2000 users a sparse GSI (`eventDate`, `lastSeenAt`) is the proper fix — deliberately not built for v1.
- **Legacy data** needs the GSI3 backfill (ADM-07) before templates are enabled.
- **`maxPerUser` is lifetime**: a user who becomes active after `dormant_60`, goes quiet again a year later, gets no third win-back.
- **Stuck `sending` rows** are visible but not auto-resolved (at-most-once by design).
- **Bounces/complaints** are not processed (no SNS feedback loop). SES will suppress repeatedly bouncing addresses account-wide, but the app doesn't learn about it. Recommended follow-up.
- **Holidays** (Dutch public holidays) are not excluded — Mon–Fri only.
- **Per-template send counts** are not on the templates page; the log is the source.

---

## Appendix A — Default Dutch text proposals (review these!)

Tone: warm, short, informal "je". Every body opens (after the greeting) with a one-sentence intro naming Wie-Doet-Het ("de gratis app om taken te verdelen binnen een groep") and why the recipient gets the mail (their account, or the group they created), because not every recipient remembers having used the app. Each is subject + body (HTML; the shell and footer are added automatically). `{{…}}` per § Placeholders. Buttons are simple link-buttons (`<a>` styled inline) to the relevant URL.

**`welcome`** — subject: `Welkom bij Wie-Doet-Het, {{firstName}}!`
> Hoi {{firstName}},
> Je hebt een account aangemaakt bij Wie-Doet-Het, de gratis app om taken te verdelen binnen een groep. Zonder eindeloos appen: jij maakt een lijst, iedereen kiest zelf wat hij of zij doet.
> Zo begin je:
> 1. Maak een groep aan (een etentje, verjaardag, klusdag…)
> 2. Zet de taken erin
> 3. Deel de link via WhatsApp — deelnemers hebben geen account nodig
>
> [Maak je eerste groep]({{createGroupUrl}})

**`no_group`** — subject: `Zullen we samen je eerste groep maken?`
> Hoi {{firstName}}, je hebt een account bij Wie-Doet-Het, de gratis app om taken te verdelen binnen een groep, maar je hebt nog geen groep gemaakt. Dat kost twee minuten: geef je groep een naam, voeg een paar taken toe en deel de link. Begin gerust klein, je kunt altijd taken toevoegen.
>
> [Start een groep]({{createGroupUrl}})

**`no_tasks`** — subject: `Bijna klaar: voeg taken toe aan {{groupName}}`
> Hoi {{firstName}}, je hebt in Wie-Doet-Het, de gratis app om taken te verdelen binnen een groep, de groep "{{groupName}}" aangemaakt — top! Alleen staan er nog geen taken in, dus er valt nog niets te kiezen. Voeg een paar taken toe (bijv. "Drinken meenemen", "Taart bakken"), dan kun je de link delen.
>
> [Taken toevoegen]({{groupUrl}})

**`no_claims`** — subject: `Nog niemand heeft een taak gekozen in {{groupName}}`
> Hoi {{firstName}}, in Wie-Doet-Het, de gratis app om taken te verdelen binnen een groep, staan de taken voor "{{groupName}}" klaar, maar niemand heeft er nog een gekozen. Heb je de link al gedeeld? Een korte herinnering in de groepsapp helpt vaak — mensen vergeten het snel weer. Tip: houd taken klein en concreet, dan is kiezen makkelijker.
>
> [Naar je groep]({{groupUrl}})

**`day_after_event`** — subject: `Hoe was {{groupName}}?`
> Hoi {{firstName}}, je hebt "{{groupName}}" georganiseerd met Wie-Doet-Het, de gratis app om taken te verdelen binnen een groep. De datum is inmiddels geweest — hopelijk was het gezellig! Volgende keer weer iets te organiseren? Je maakt zo een nieuwe groep, en je deelnemers hebben de taken weer snel op een rij.
>
> [Nieuwe groep maken]({{createGroupUrl}})

**`dormant_30`** — subject: `We missen je bij Wie-Doet-Het`
> Hoi {{firstName}}, je hebt een account bij Wie-Doet-Het, de gratis app om taken te verdelen binnen een groep. Het is een tijdje geleden dat we je zagen. Staat er weer iets op de planning waarbij iedereen moet meehelpen? Je groepen en taken staan nog gewoon voor je klaar.
>
> [Naar Wie-Doet-Het]({{appUrl}})

**`dormant_60`** — subject: `Nog iets te regelen, {{firstName}}?`
> Hoi {{firstName}}, dit is voorlopig het laatste bericht van Wie-Doet-Het, de gratis app om taken te verdelen binnen een groep waar je een account hebt: we willen je inbox niet vullen. Mocht je ooit weer een groep willen organiseren, dan staat Wie-Doet-Het voor je klaar. En vertel ons vooral gerust wat we anders of beter zouden kunnen doen — je reactie is welkom.
>
> [Naar Wie-Doet-Het]({{appUrl}})

## Appendix B — Proposed public-page text (Dutch; no backend details)

`public/privacy.md` — replace the sentence "Je e-mailadres wordt niet verkocht, niet gedeeld met adverteerders en niet gebruikt voor nieuwsbrieven." with:
> Je e-mailadres wordt niet verkocht en niet gedeeld met adverteerders. We gebruiken het voor het inloggen en om je af en toe een servicemail te sturen die je op weg helpt — bijvoorbeeld een welkomstmail, een tip als je nog geen groep hebt, een berichtje na afloop van je evenement of een herinnering als je een tijd niet bent geweest. Dat zijn geen nieuwsbrieven of reclame. In elke mail staat hoe je je afmeldt: antwoord op de mail met "afmelden", dan krijg je geen berichten meer.

…and add to the list of stored data: "of je je hebt afgemeld voor e-mail, en het moment waarop je voor het laatst bent geweest".

`public/contact.md` — add a section:
> ## Suggesties en afmelden
> Heb je een idee om Wie-Doet-Het beter te maken? Mail ons op **{SES_REPLY_TO_EMAIL}** — we lezen alles. Wil je geen e-mails meer van ons ontvangen? Stuur een mail met "afmelden" naar hetzelfde adres (of antwoord op een van onze mails). Wij zetten je dan binnen 2 werkdagen uit de mailinglijst.
