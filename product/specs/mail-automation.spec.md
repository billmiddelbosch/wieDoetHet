# Spec — Mail Automation (Frontend: Admin panel + product rules)

**Status:** BUILT on `feature/mailAutomation` (2026-09-20). Verified: `cypress/e2e/admin-automation.cy.js` 43/43, `npm run lint`, `npx vitest run src` (165 tests). Not verified against real AWS (nothing deployed).
**Companion:** `product/specs/mail-automation-api.spec.md` — the backend contract (lifecycle Lambda, timing, templates, endpoints, DynamoDB). This file specifies the **Admin-panel UI** and the user-visible product rules. Read the API spec first; response shapes referenced here are defined there.
**Branch:** `feature/mailAutomation`
**Last Updated:** 2026-09-20

---

## Purpose

Give the owner (an admin) control over the lifecycle-mail automation from the existing Admin Section, without touching Lambda env vars or DynamoDB:

1. **Templates** — see the seven automatic mails, switch each on/off, read and edit its text proposal (subject + body), reset it to the default, and send a test mail to yourself.
2. **Verzendlog** — see every automatic mail that was sent (or failed), filterable.
3. **Opt-out** — mark a user as "afgemeld" when they reply asking to unsubscribe, and undo it.

Everything the recipient sees in the mail (footer with suggestion invitation and opt-out instructions) is **not** editable here — it is fixed in code (API spec § Footer).

### Product rules the UI must make visible (summary of the API spec, for the reader of this file)

- Mails go out on **weekdays at 10:00 (Amsterdam)**; "timely" templates Mon–Fri, "normal" templates Tue–Thu only. The template card shows which.
- Every template is **disabled by default**; there is also a **master switch** ("Hoofdschakelaar"), **off until an admin turns it on** and toggled from this screen. The UI shows the switch state and when the automation has never run — otherwise an admin would toggle templates on and wonder why nothing happens.
- Opted-out users receive no automatic mail **and** are skipped by the manual "E-mail versturen" flow.

---

## Routes

Added as children of the existing `/admin` route (same `requiresAdmin` guard, same `AdminLayout`):

| Path | Name | View | Notes |
|---|---|---|---|
| `/admin/automation` | `admin-automation` | `AdminAutomationView` | Templates list + status banners |
| `/admin/automation/log` | `admin-mail-log` | `AdminMailLogView` | Sent-mail log |

Router edit: two lazy-loaded children next to `admin-users`/`admin-groups` in `src/router/index.js`. Both `noindex` via `useHead`.

**Navigation:** the admin sub-nav (`AdminLayout`) gets a fourth tab **"Automatisering"** → `/admin/automation`. Inside `AdminAutomationView` and `AdminMailLogView` a small in-page tab pair **"Templates" | "Verzendlog"** (two `RouterLink`s, i.e. `<a>` elements) switches between the two routes (kept out of the global sub-nav so it stays a four-tab bar on mobile). The "Automatisering" sub-nav tab is highlighted on both routes.

---

## Composables

Live in `src/composables/`, wrap all Axios calls (never called from components), follow the shape of `useAdminUsers` and return plain objects.

### `useAdminMailTemplates()`

| Member | Type | Notes |
|---|---|---|
| `templates` | `Ref<MailTemplate[]>` | from `GET /admin/mail-templates` `items` |
| `lastRun` | `Ref<LastRun \| null>` | from the same response (includes `killSwitch`) |
| `master` | `Ref<{ enabled, updatedAt, updatedBy }>` | from the same response; a response without `master` (older backend) counts as `{ enabled: false, updatedAt: null, updatedBy: null }` |
| `masterSaving` | `Ref<boolean>` | a master-switch write is in flight (locks the master toggle) |
| `setMaster(enabled)` | `Promise<boolean>` | `PATCH /admin/mail-master` `{ enabled }`. Like `setEnabled`: no optimistic UI — `master` is replaced by the server response, and a failure only shows up in the return value. |
| `loading` | `Ref<boolean>` | initial fetch |
| `error` | `Ref<string \| null>` | fetch error message |
| `fetchTemplates()` | `Promise<void>` | |
| `setEnabled(id, enabled)` | `Promise<boolean>` | `PATCH /admin/mail-templates/{id}` `{ enabled }`. Optimistic UI is **not** used: the toggle reflects the server response (the template in `templates` is replaced by the returned object). On failure `error` is set and the toggle reverts. |
| `saveTemplate(id, { subject, bodyHtml })` | `Promise<{ ok: boolean, message?: string }>` | `PATCH` with both fields. Returns the server's Dutch 400 message so the modal can show it. |
| `resetTemplate(id)` | `Promise<{ ok: boolean, message?: string }>` | `PATCH` `{ subject: null, bodyHtml: null }` |
| `sendTest(id)` | `Promise<{ ok: boolean, to?: string, message?: string }>` | `POST /admin/mail-templates/{id}/test` |
| `savingIds` | `Ref<Set<string>>` | ids with a write in flight (disables that card's controls) |

### `useAdminMailLog()`

Same cursor-stack pagination as `useAdminUsers` (`hasPrevious`, `hasNext`, `nextPage()`, `previousPage()`), plus:

| Member | Notes |
|---|---|
| `items` | `MailLogEntry[]` |
| `filters` | `{ templateId: '', status: '', q: '' }` (reactive) |
| `setFilters(partial)` | resets the cursor stack and refetches |
| `loading`, `error` | as usual |

Request: `GET /admin/mail-log?limit=20[&templateId=][&status=][&q=][&cursor=]` — empty filters are **omitted** from the query string.

### `useAdminUsers()` (existing) — additions

- `setMailOptOut(userId, optOut)` → `PATCH /admin/users/{userId}/mail-opt-out` `{ optOut }`; on success it updates `currentUser.mailOptOut`/`mailOptOutAt` in place. Returns `boolean`.
- `AdminUserSummary`/`Detail` now carry `mailOptOut` (default `false`); detail also `mailOptOutAt`, `lastSeenAt`.

### Existing mail composer — addition

`useAdminUsers.sendMail` result now includes `skippedOptOut` (number, default `0`); `AdminMailComposeModal` shows an extra line when it is > 0 (see i18n `admin.mail.skippedOptOut`).

---

## Views / Components (atomic level)

| Component | Level | Location | Purpose |
|---|---|---|---|
| `AdminAutomationView` | page | `src/views/` | Heading, in-page tabs, status banners, list of template cards |
| `AdminMailLogView` | page | `src/views/` | Heading, in-page tabs, filters, table, pagination |
| `AdminMailMasterCard` | molecule | `src/components/molecules/` | The master switch: title, state text, toggle, emergency-stop warning, last-changed line |
| `AdminMailTemplateCard` | molecule | `src/components/molecules/` | One template: name, description, trigger, timing chip, customised badge, toggle, edit button |
| `AdminMailTemplateEditModal` | organism | `src/components/organisms/` | Edit subject/body, placeholders help, footer note, save / reset / test |

Reuses `BaseCard`, `BaseBadge`, `BaseToggle`, `BaseButton`, `BaseModal`, `BaseInput`, `BaseRichTextEditor`, `BaseAlert`, `BaseSpinner`, `BaseTable`, `BasePagination`, `BaseEmptyState`, `ConfirmModal`. No new atoms.

### `AdminAutomationView`

- `<h1>` **"Mail-automatisering"**.
- **Master switch card** (`AdminMailMasterCard`), shown above the template list, driven by `master` (not by `lastRun`, which is only as fresh as the last run):
  - `<h2>` "Hoofdschakelaar", a `BaseToggle` labelled "Mails versturen" (`button[role=switch]`, `aria-checked` = `master.enabled`, disabled while `masterSaving`).
  - State text: on → "De hoofdschakelaar staat aan — ingeschakelde templates worden verstuurd bij de eerstvolgende run."; off → "De hoofdschakelaar staat uit — er worden geen mails verstuurd, ook niet voor ingeschakelde templates."
  - `master.enabled && lastRun.killSwitch === true` → `warning` inside the card: the emergency stop on the server (`LIFECYCLE_MAIL_ENABLED=false`) overrides the switch, so nothing is sent.
  - A quiet "Laatst gewijzigd: {datetime}" line when `master.updatedAt` is set.
  - **Switching off** is immediate (no confirmation): `setMaster(false)`. **Switching on** first opens a `ConfirmModal` ("Hoofdschakelaar inschakelen?", with the number of currently enabled templates, buttons "Inschakelen" / "Annuleren"); only "Inschakelen" sends `setMaster(true)`. Cancelling sends nothing. The switch shows the server's answer, not the requested state; on failure it stays as it was and the page's "Wijzigen mislukt." alert (`toggleFailed`) is shown.
  - The switch never changes any template's own toggle.
- **Banner** (`BaseAlert`), shown above the list, based on `lastRun`:
  - `lastRun === null` → `warning`: "De automatisering heeft nog nooit gedraaid."
  - otherwise a quiet line "Laatste run: {datetime} — {sent} verstuurd, {failed} mislukt." (`lastRun.at`, formatted like other admin dates).
- Loading → `BaseSpinner`; error → `BaseAlert danger` (`admin.automation.loadError`).
- Renders one `AdminMailTemplateCard` per item, API order (= priority order).
- Owns the edit modal state (`editingId`).

### `AdminMailTemplateCard` (molecule)

Props: `template` (API object), `saving` (boolean). Emits: `toggle(enabled)`, `edit`.
Renders an `<article>` containing:
- `<h3>` template name (i18n `admin.automation.templates.{id}.name`)
- description (`…description`) and trigger sentence (`…trigger`), both i18n
- timing chip: tier `timely` → **"Ma–vr om 10:00"**, `normal` → **"Di–do om 10:00"**
- `BaseBadge`: **"Aangepaste tekst"** (`brand`) when `isCustomised`, else **"Standaardtekst"** (`neutral`)
- `BaseToggle` labelled **"Ingeschakeld"** (`button[role=switch]`, `aria-checked` reflects `enabled`); disabled while `saving`
- **"Bewerken"** button

### `AdminMailTemplateEditModal` (organism)

Props: `open`, `template` (object or null), `saving`. Emits: `close`, `saved`.
- Title **"Template bewerken"** + the template name.
- `BaseInput` `#template-subject` (label "Onderwerp"), `BaseRichTextEditor` (`.ProseMirror`; label "Tekst").
- **Variable chips**, labelled "Beschikbare velden:", one per entry of `template.variables`, shown as `{{firstName}}` etc. Clicking a chip inserts the token at the cursor of the focused field if trivial to do, otherwise chips are **display-only** (v1: display-only is acceptable; the acceptance criteria only require they are listed).
- **Footer note** (muted): "De voettekst met de uitnodiging voor suggesties en de uitleg over afmelden wordt automatisch onder elke mail geplaatst."
- Buttons: **"Opslaan"** (primary), **"Terug naar standaardtekst"** (secondary; disabled when `!template.isCustomised`), **"Testmail naar mezelf"** (secondary), **"Annuleren"** (`common.cancel`).
- **Validation (client, before any request):** empty subject → "Onderwerp is verplicht."; empty/blank body (incl. `<p></p>`) → "Tekst is verplicht." Reuses `admin.mail.subjectRequired` / `bodyRequired`-style wording under the new `admin.automation.edit.*` keys.
- **Server errors:** a `400` message from `saveTemplate` (e.g. "Onbekend of niet toegestaan veld: {{groupName}}") is shown in a `BaseAlert danger` inside the modal, verbatim.
- **Save** sends `{ subject, bodyHtml }` (both fields — the modal does not diff). If the edited text is identical to the default the server still stores an override; acceptable v1 behaviour (the admin can reset).
- **Reset** sends `{ subject: null, bodyHtml: null }` immediately (no confirm — it only reverts to a known default, and the admin can re-edit; the previous custom text is lost, which the button label makes clear) and refreshes the editor content with the defaults, modal stays open.
- **Test mail** shows a success alert "Testmail verstuurd naar {email}." or the error message; does not close the modal.
- The modal edits the **effective** text (`subject`/`bodyHtml`), pre-filled on open.

### `AdminMailLogView`

- `<h1>` **"Verzendlog"**, in-page tabs.
- Filters: `<select id="log-template">` ("Alle templates" + the 7 names), `<select id="log-status">` ("Alle statussen", "Verzonden", "Mislukt", "Bezig"), and a search input (placeholder "Zoek op e-mailadres..."). Changing any filter refetches from page 1; the search input is debounced the same way as the users search.
- `BaseTable` columns: **Verzonden op** (`sentAt ?? createdAt`), **Ontvanger** (email; second line the user name), **Template** (translated name; for group-scoped rows the group name in muted text), **Onderwerp**, **Status** (`BaseBadge`: `sent` → success "Verzonden", `failed` → danger "Mislukt", `sending` → warning "Bezig"), **Pogingen** (`attempts`).
- A `failed` row shows its `errorMessage` as a muted second line under the status badge.
- Empty (no filters) → `BaseEmptyState` "Nog geen mails verstuurd"; empty with filters → "Geen resultaten".
- Error → `BaseAlert danger` (`admin.mailLog.loadError`).
- `BasePagination` ("Vorige" / "Volgende").
- Read-only: no resend/delete actions in v1.

### `AdminUserDetailView` (existing) — addition: "E-mailvoorkeuren"

A new `BaseCard` section below the group list titled **"E-mailvoorkeuren"** containing:
- Status line: not opted out → "Deze gebruiker ontvangt e-mails."; opted out → "Deze gebruiker is afgemeld voor e-mail sinds {date}." (`mailOptOutAt`, formatted with `formatDate`).
- `BaseToggle` labelled **"Afgemeld voor e-mail"**, description "Ontvangt geen automatische mails en geen beheerdersmails meer." — checked = opted out.
- Turning it **ON** (opting the user out) applies immediately (`PATCH {optOut:true}`); this is the safe direction and the common case (the user asked for it).
- Turning it **OFF** (re-subscribing) opens `ConfirmModal`: title **"Weer e-mails toestaan?"**, message "Deze gebruiker krijgt weer automatische mails en beheerdersmails. Doe dit alleen als de gebruiker daar zelf om heeft gevraagd.", confirm **"Ja, toestaan"**. Only on confirm is `PATCH {optOut:false}` sent. Rationale: an accidental re-subscribe of someone who asked to be removed is the costly mistake.
- The toggle is disabled while the request is in flight; a failed request reverts the toggle and shows a `BaseAlert danger` ("Opslaan mislukt.").
- Shown for **all** users including admins (harmless, keeps the page uniform).

### `AdminUsersView` (existing) — addition

An **"Afgemeld"** `BaseBadge` (`warning`) next to the email address in the list row when `mailOptOut` is true. No new column, no new filter in v1.

### `AdminMailComposeModal` (existing) — addition

In the result alert, when `result.skippedOptOut > 0`, add a line "{n} overgeslagen (afgemeld)". Also, in the pre-send description, nothing changes (the opt-out filtering is server-side; the count is reported after).

---

## i18n Key List

All keys in **both** `src/i18n/locales/nl.json` and `en.json`. Dutch text below is normative (tests assert it); English is a straightforward translation. **Mail content itself (subject/body defaults) is not i18n — it comes from the API and is always Dutch.**

```
admin.subnav.automation                     "Automatisering"

admin.automation.title                      "Mail-automatisering"
admin.automation.tabTemplates               "Templates"
admin.automation.tabLog                     "Verzendlog"
admin.automation.neverRan                   "De automatisering heeft nog nooit gedraaid."
admin.automation.masterOff                  "De hoofdschakelaar staat uit — er worden geen mails verstuurd, ook niet voor ingeschakelde templates."
admin.automation.master.title               "Hoofdschakelaar"
admin.automation.master.label               "Mails versturen"
admin.automation.master.on                  "De hoofdschakelaar staat aan — ingeschakelde templates worden verstuurd bij de eerstvolgende run."
admin.automation.master.updatedAt           "Laatst gewijzigd: {at}"
admin.automation.master.killSwitch          "De noodstop op de server (LIFECYCLE_MAIL_ENABLED=false) staat aan: er worden geen mails verstuurd, ook niet met deze schakelaar aan."
admin.automation.master.confirmTitle        "Hoofdschakelaar inschakelen?"
admin.automation.master.confirmMessage      "Vanaf de eerstvolgende run (ma–vr om 10:00) worden er mails verstuurd voor de ingeschakelde templates. Nu ingeschakeld: {count}. Weet je het zeker?"
admin.automation.master.confirmLabel        "Inschakelen"
admin.automation.lastRun                    "Laatste run: {at} — {sent} verstuurd, {failed} mislukt."
admin.automation.loadError                  "Templates laden mislukt."
admin.automation.enabled                    "Ingeschakeld"
admin.automation.edit                       "Bewerken"
admin.automation.customised                 "Aangepaste tekst"
admin.automation.default                    "Standaardtekst"
admin.automation.timing.timely              "Ma–vr om 10:00"
admin.automation.timing.normal              "Di–do om 10:00"
admin.automation.toggleError                "Wijzigen mislukt."

admin.automation.templates.welcome.name           "Welkom"
admin.automation.templates.welcome.description    "Welkomstmail met de eerste stappen."
admin.automation.templates.welcome.trigger        "Dag na registratie, alleen als er nog geen groep is"
admin.automation.templates.no_group.name          "Nog geen groep"
admin.automation.templates.no_group.description   "Duwtje om de eerste groep aan te maken."
admin.automation.templates.no_group.trigger       "48 uur na registratie, als er nog geen groep is"
admin.automation.templates.no_tasks.name          "Groep zonder taken"
admin.automation.templates.no_tasks.description   "Herinnering om taken toe te voegen aan een nieuwe groep."
admin.automation.templates.no_tasks.trigger       "24 uur na het aanmaken van een groep zonder taken"
admin.automation.templates.no_claims.name         "Taken zonder claims"
admin.automation.templates.no_claims.description  "Tip om de link te delen als niemand een taak heeft gekozen."
admin.automation.templates.no_claims.trigger      "4 dagen na de eerste taak, als niemand een taak heeft geclaimd"
admin.automation.templates.day_after_event.name         "Dag na het evenement"
admin.automation.templates.day_after_event.description  "Terugblik en uitnodiging voor een nieuwe groep."
admin.automation.templates.day_after_event.trigger      "De dag na de evenementdatum van een groep"
admin.automation.templates.dormant_30.name        "Inactief (30 dagen)"
admin.automation.templates.dormant_30.description "Eerste win-back mail."
admin.automation.templates.dormant_30.trigger     "30 dagen zonder activiteit"
admin.automation.templates.dormant_60.name        "Inactief (60 dagen)"
admin.automation.templates.dormant_60.description "Tweede en laatste win-back mail."
admin.automation.templates.dormant_60.trigger     "60 dagen zonder activiteit, na de 30-dagenmail"

admin.automation.editModal.title            "Template bewerken"
admin.automation.editModal.subject          "Onderwerp"
admin.automation.editModal.body             "Tekst"
admin.automation.editModal.variables        "Beschikbare velden:"
admin.automation.editModal.footerNote       "De voettekst met de uitnodiging voor suggesties en de uitleg over afmelden wordt automatisch onder elke mail geplaatst."
admin.automation.editModal.save             "Opslaan"
admin.automation.editModal.reset            "Terug naar standaardtekst"
admin.automation.editModal.test             "Testmail naar mezelf"
admin.automation.editModal.testSent         "Testmail verstuurd naar {email}."
admin.automation.editModal.subjectRequired  "Onderwerp is verplicht."
admin.automation.editModal.bodyRequired     "Tekst is verplicht."
admin.automation.editModal.saveError        "Opslaan mislukt."

admin.mailLog.title                         "Verzendlog"
admin.mailLog.filterTemplate                "Template"
admin.mailLog.filterStatus                  "Status"
admin.mailLog.allTemplates                  "Alle templates"
admin.mailLog.allStatuses                   "Alle statussen"
admin.mailLog.searchPlaceholder             "Zoek op e-mailadres..."
admin.mailLog.columnSentAt                  "Verzonden op"
admin.mailLog.columnRecipient               "Ontvanger"
admin.mailLog.columnTemplate                "Template"
admin.mailLog.columnSubject                 "Onderwerp"
admin.mailLog.columnStatus                  "Status"
admin.mailLog.columnAttempts                "Pogingen"
admin.mailLog.status.sent                   "Verzonden"
admin.mailLog.status.failed                 "Mislukt"
admin.mailLog.status.sending                "Bezig"
admin.mailLog.empty                         "Nog geen mails verstuurd"
admin.mailLog.noResults                     "Geen resultaten"
admin.mailLog.loadError                     "Verzendlog laden mislukt."

admin.userDetail.mailPrefsTitle             "E-mailvoorkeuren"
admin.userDetail.mailPrefsSubscribed        "Deze gebruiker ontvangt e-mails."
admin.userDetail.mailPrefsOptedOut          "Deze gebruiker is afgemeld voor e-mail sinds {date}."
admin.userDetail.optOutLabel                "Afgemeld voor e-mail"
admin.userDetail.optOutDescription          "Ontvangt geen automatische mails en geen beheerdersmails meer."
admin.userDetail.resubscribeTitle           "Weer e-mails toestaan?"
admin.userDetail.resubscribeMessage         "Deze gebruiker krijgt weer automatische mails en beheerdersmails. Doe dit alleen als de gebruiker daar zelf om heeft gevraagd."
admin.userDetail.resubscribeConfirm         "Ja, toestaan"
admin.userDetail.optOutError                "Opslaan mislukt."

admin.users.optedOut                        "Afgemeld"
admin.mail.skippedOptOut                    "{n} overgeslagen (afgemeld)"

seo.adminAutomation.title                   "Mail-automatisering"
seo.adminMailLog.title                      "Verzendlog"
```

Existing keys reused unchanged: `admin.mail.*`, `common.cancel`, `admin.users.searchPlaceholder`-style pagination labels.

---

## Data flow summary

```
AdminAutomationView ── useAdminMailTemplates ── GET   /admin/mail-templates
        │  toggle  ─────────────────────────────── PATCH /admin/mail-templates/{id}   { enabled }
        │  modal save / reset ──────────────────── PATCH /admin/mail-templates/{id}   { subject, bodyHtml | null }
        │  modal test ───────────────────────────── POST  /admin/mail-templates/{id}/test
AdminMailLogView ───── useAdminMailLog ──────────── GET   /admin/mail-log?…
AdminUserDetailView ── useAdminUsers.setMailOptOut ─ PATCH /admin/users/{id}/mail-opt-out { optOut }
AdminMailComposeModal ─ useAdminUsers.sendMail ───── POST  /admin/mail  → result.skippedOptOut
```

---

## Acceptance Criteria

**Access & navigation**
- [x] `/admin/automation` and `/admin/automation/log` redirect a logged-out visitor to `/login` and a non-admin to `/dashboard`.
- [x] The admin sub-nav has an "Automatisering" tab; the in-page "Templates" | "Verzendlog" tabs navigate between the two routes; the sub-nav tab stays active on both.

**Templates page**
- [x] Lists exactly the 7 templates in API order with name, description, trigger sentence, timing chip (Ma–vr / Di–do), and a "Standaardtekst"/"Aangepaste tekst" badge.
- [x] Each card's toggle reflects `enabled`; toggling sends `PATCH {enabled}` and the card reflects the server response; a failed request reverts the toggle and shows an error.
- [x] Banner "nog nooit gedraaid" when `lastRun` is null; the last-run line otherwise.
- [x] The master switch card reflects `master.enabled` (not `lastRun`) with the matching state text; a `master` missing from the response counts as off.
- [x] Switching the master switch **on** first asks for confirmation (showing the number of enabled templates); only "Inschakelen" sends `PATCH /admin/mail-master {enabled:true}`, "Annuleren" sends nothing. Switching **off** sends `{enabled:false}` immediately.
- [x] The master switch follows the server response; a failed request leaves it as it was and shows "Wijzigen mislukt.". While in flight it is locked. It never changes any template toggle.
- [x] A warning shows in the card when the switch is on but `lastRun.killSwitch` is true (the server emergency stop overrides it).
- [x] Load error shows an alert.

**Edit modal**
- [x] Opens pre-filled with the effective subject and body; lists the allowed placeholder tokens; shows the fixed-footer note.
- [x] Empty subject or empty body blocks saving with the Dutch validation message and sends no request.
- [x] Save sends `{ subject, bodyHtml }`; success closes the modal and the card shows "Aangepaste tekst".
- [x] A server 400 message is shown verbatim and the modal stays open.
- [x] "Terug naar standaardtekst" is disabled unless customised; clicking it sends `{ subject: null, bodyHtml: null }` and restores the default text in the editor.
- [x] "Testmail naar mezelf" calls the test endpoint and shows the result without closing the modal.

**Verzendlog**
- [x] Lists entries with Verzonden op, Ontvanger, Template, Onderwerp, Status badge (Verzonden/Mislukt/Bezig), Pogingen; failed rows show the error message.
- [x] Template/status filters and search send the matching query params (and omit empty ones) and reset to page 1.
- [x] Paginates with Vorige/Volgende via the `cursor` param; empty state, filtered-empty state, and error state exist.

**Opt-out**
- [x] User detail shows "E-mailvoorkeuren" with the correct status text; toggling ON sends `PATCH {optOut:true}` immediately and updates the status line.
- [x] Toggling OFF asks for confirmation ("Weer e-mails toestaan?") and only sends `PATCH {optOut:false}` after "Ja, toestaan"; cancelling leaves the toggle on.
- [x] Opted-out users show an "Afgemeld" badge in the users list.
- [x] The manual mail result shows "{n} overgeslagen (afgemeld)" when `skippedOptOut > 0`.

**Quality**
- [x] All strings via `useI18n()`, keys present in `nl.json` and `en.json`.
- [x] Composables have Vitest tests (`useAdminMailTemplates`, `useAdminMailLog`, the `setMailOptOut` addition); the new components have component tests (`AdminMailTemplateCard`, `AdminMailTemplateEditModal`, `AdminMailMasterCard`), following the `AdminMailComposeModal.test.js` pattern.
- [x] `cypress/e2e/admin-automation.cy.js` passes; `npm run lint` and `npm run test:unit` pass.
- [x] `product/data-model.md` and `product/product-overview.md` reflect the feature.

## Known Limitations

- **No template preview of the final mail in the UI** other than the "Testmail naar mezelf" button. (A live HTML preview pane is a possible follow-up.)
- **Variable chips are display-only** in v1 (no click-to-insert requirement).
- **No per-template send statistics** on the templates page — use the log with the template filter.
- **No manual "send now" or "run now"** in the UI. Running/testing the automation itself is done via the Lambda console (`dryRun`, `force`) — see the API spec.
- **The master switch is toggleable from the UI** (this reverses the original v1 decision to keep it a Lambda env var). It is stored per environment in the table (`MAILSTATE#lifecycle` / `MASTER`), so the dev and production databases each have their own switch, and it takes effect at the next run (Mon–Fri 10:00) — there is no immediate send. Because a kill switch that needs the app to be healthy is a weaker kill switch, `LIFECYCLE_MAIL_ENABLED=false` on the Lambda stays as a hard emergency override that wins over the switch; the card warns when it is active (via `lastRun.killSwitch`, which is only as fresh as the last run).
- **No bulk opt-out import.** The owner processes replies one by one via the user detail page (search by email in the users list).
- **Timing chips describe the tier, not the exact next send.** They do not show when a given user will get the mail.
- **English translations** of the admin strings exist for parity but the mails themselves are Dutch only.
