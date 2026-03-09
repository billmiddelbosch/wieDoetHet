# Feature Backlog — wieDoetHet

**Last Updated:** 2026-03-09 (added SEO-01 at top)

This backlog captures all possible future features beyond the current MVP. Items are grouped by theme, not priority. Each item includes a rough effort indication (S / M / L / XL).

---

## Growth & Discoverability

| # | Feature | Effort | Notes |
|---|---|---|---|
| SEO-01 | **SEO optimisation** | M | Optimise the app for selected keywords in both regular Google search results and Google AI Overviews (SGE). Includes: meta titles and descriptions per page, structured data (JSON-LD), Open Graph tags for share link previews, sitemap.xml, robots.txt, landing page copy tuned for target keywords, and ensuring key pages are server-renderable or have static fallback content so Googlebot can index them without executing JavaScript. |

---

## Sharing & Communication

| # | Feature | Effort | Notes |
|---|---|---|---|
| S-02 | **WhatsApp reminder** | M | Initiator schedules a reminder message N hours/days before event via EventBridge + WhatsApp API. |
| S-07 | **QR code for share link** | S | Generate a QR code for the group share URL, downloadable as PNG. Useful for physical events. |
| S-05 | **Copy-paste summary** | S | One-tap button to copy a formatted plain-text task summary (e.g. for pasting into any chat). |
| S-01 | **WhatsApp poll (interactive)** | L | Send task list as interactive button/list message. Recipients tap to claim. Built — pending Meta setup. See `featureWhatsApp.md`. |
| S-06 | **iMessage / RCS share** | S | Platform-native share sheet integration (Web Share API) so initiator can share to any app. |
| S-03 | **Email invitation** | M | Alternative to WhatsApp for groups that prefer email. Sends share link via SES. |
| S-04 | **SMS invitation** | M | Send share link via SNS SMS for recipients without WhatsApp. |

---

## Task Management

| # | Feature | Effort | Notes |
|---|---|---|---|
| T-11 | **Task claim deadline + initiator reminder** | M | Initiator sets an optional deadline per task (date + time) by which all claim slots must be filled. If the task is not fully claimed when the deadline passes, the system sends a WhatsApp reminder to the initiator. Requires A-06 (phone number on profile) and a scheduled check via EventBridge. Extends the countdown display introduced in T-07. |
| T-07 | **Task deadlines** | S | Optional due time per task. Show countdown or overdue indicator. |
| T-12 | **Task claim actions** | M | Initiator can attach an automated action to a task that fires when it is claimed. First supported action: generate a Tikkie payment request link and send it to the claimer via WhatsApp. Designed to be extensible to other action types (webhook, email, etc.) in the future. |
| T-08 | **Required vs optional tasks** | S | Mark individual tasks as required (must be claimed) vs optional. |
| T-03 | **Bulk task import** | M | Paste a newline-separated list to create multiple tasks at once. |
| T-02 | **Task templates** | M | Save a task list as a reusable template. Apply template when creating a new group. |
| T-04 | **Task categories / sections** | M | Group tasks under named sections (e.g. "Eten", "Drinken", "Materiaal") with section headers. |
| T-01 | **Task reordering (drag & drop)** | M | Initiator can drag tasks into a preferred order. `PATCH /tasks/order` already in roadmap. |
| T-09 | **Task sell-off / transfer** | M | Claimer can hand off their task to another member, subject to initiator approval. |
| T-10 | **Sub-tasks / checklist** | M | Tasks can have child checklist items. Useful for complex contributions. |
| T-06 | **Task comments** | L | Members can leave a short note on a task they claimed (e.g. "I'll bring the vegetarian option"). |
| T-05 | **File attachment on task** | L | Attach a document or image to a task (e.g. recipe PDF, instruction image). Stored in S3. |

---

## Groups & Events

| # | Feature | Effort | Notes |
|---|---|---|---|
| G-01 | **Recurring groups** | L | Mark a group as recurring (daily / weekly / monthly) when creating or editing. On each recurrence: claims are auto-reset, the group becomes active again, and the initiator receives a WhatsApp notification (via A-06) reminding them to resend the task list to their members. Scheduled via EventBridge recurring rule. |
| G-03 | **Group expiry / auto-archive** | S | Set an event date; group auto-archives after that date. Archived groups are read-only. |
| G-04 | **Group picture upload** | M | Initiator uploads a cover photo for the group. Stored in S3. Already in Milestone 1.7 roadmap. |
| G-02 | **Group duplication** | S | Clone an existing group (with all tasks, without claims) for a new event. |
| G-06 | **"Must claim at least one" enforcement** | S | Configurable group setting — already in roadmap but not yet implemented. |
| G-08 | **Group categories / tags** | S | Organise dashboard groups by tag (e.g. "Familie", "Werk", "Sport"). |
| G-05 | **Member roster** | M | Initiator explicitly invites named members. System tracks who has and hasn't claimed yet. |
| G-07 | **Group capacity limit** | S | Limit total number of people who can claim tasks in a group. |
| G-09 | **Public group directory** | XL | Opt-in public listing for open events (e.g. volunteer sign-ups). |

---

## Scorecard & Visibility

| # | Feature | Effort | Notes |
|---|---|---|---|
| V-04 | **"Nog niet geclaimd" reminder** | M | Initiator can send a nudge to all members who haven't claimed anything yet. |
| V-06 | **Anonymous claim name editing** | S | Allow a claimer to correct their name after submitting (session-based). |
| V-05 | **Claim confirmation email** | S | Optional: after claiming, send the claimer a confirmation email with the task details. |
| V-01 | **Real-time live updates** | L | Replace manual refresh with SSE or WebSocket so scorecard updates automatically. |
| V-02 | **Activity log** | M | Timestamped log of who claimed/unclaimed which task and when. Visible to initiator. |
| V-03 | **Export scorecard** | M | Download scorecard as CSV or PDF. Useful for paper lists or archiving. |

---

## Notifications & Engagement

| # | Feature | Effort | Notes |
|---|---|---|---|
| N-02 | **Claim alert for initiator** | S | Real-time badge/toast in the app when a claim comes in (requires live updates, V-01). |
| N-04 | **Reminder scheduling UI** | M | Initiator picks a date/time to send a WhatsApp or email reminder automatically. |
| N-01 | **PWA push notifications** | L | Notify initiator when a task is claimed/unclaimed. Requires service worker + push subscription. |
| N-03 | **Event countdown** | S | Show a countdown to the event date in GroupHeader and share link preview. |

---

## Authentication & Accounts

| # | Feature | Effort | Notes |
|---|---|---|---|
| A-01 | **Social login (Google)** | M | Sign in with Google via Cognito federated identity. Reduces friction for new users. |
| A-02 | **Magic link login** | M | Passwordless email login (send a one-time link). Especially useful on mobile. |
| A-05 | **Profile name / avatar** | S | Registered users set a display name and optional avatar used in scorecards. |
| A-03 | **Persistent anonymous identity** | M | Link an anonymous claim to a future account so history is preserved when they register. |
| A-04 | **Account deletion** | S | GDPR-compliant self-service account and data deletion. |

---

## Monetisation & Premium

| # | Feature | Effort | Notes |
|---|---|---|---|
| M-04 | **Analytics dashboard** | L | Initiator sees aggregate stats: average claim rate, most popular tasks, time-to-full. |
| M-05 | **API access** | L | REST API key for power users / integrations (Zapier, Make, custom scripts). |
| M-03 | **White-label / embed** | XL | Embed a task-claim widget on an external website (e.g. club or school site). |
| M-01 | **Premium tier** | XL | Unlimited groups, custom branding, advanced analytics, priority support. Stripe integration. |
| M-02 | **Custom domain** | L | Premium: serve a group share link from the initiator's own domain (e.g. `taken.mijnclub.nl`). |

---

## UX & Accessibility

| # | Feature | Effort | Notes |
|---|---|---|---|
| U-09 | **PWA install prompt** | S | Add a `manifest.json` (name, icons, theme colour, `display: standalone`) and register a service worker so browsers offer an "Add to home screen" prompt. Show an in-app install banner for iOS (which suppresses the native prompt) with instructions to use the Share → Add to Home Screen flow. |
| U-10 | **PWA install conversion strategy** | M | Surface the install nudge at high-intent moments (e.g. after successfully claiming a task or creating a group) rather than on first visit. Use a lightweight, dismissible bottom sheet — not a modal — so it never blocks the primary action. Remember dismissal in localStorage and do not re-prompt within N days. Skip the nudge entirely when already running as a standalone PWA. Also: detect if the PWA is already installed on Android/Chrome via `navigator.getInstalledRelatedApps()` and show a non-blocking "Open in app" smart banner so users who open wiedoethet.nl in the browser are nudged to switch to the installed PWA. iOS detection is not possible — no API exists. Requires U-09. |
| U-02 | **Onboarding tour** | M | First-use walkthrough for new initiators (create group → add tasks → share). |
| U-01 | **Undo unclaim** | S | Show a brief "Ongedaan maken" toast after unclaiming so the user can reverse quickly. |
| U-03 | **Empty state illustrations** | S | Friendly illustrations for empty group list, empty task list, and empty scorecard. |
| U-07 | **i18n: English UI** | M | Full English translation. Currently Dutch-only with English fallback strings. |
| U-04 | **WCAG 2.1 AA audit** | M | Full accessibility audit and fixes: colour contrast, keyboard nav, screen reader labels. |
| U-05 | **Offline support** | L | PWA offline mode — read cached task lists without a connection. |
| U-06 | **Keyboard shortcuts** | S | Power-user keyboard shortcuts for initiators (n = new task, e = edit, d = delete). |
| U-08 | **i18n: additional locales** | M | Community-contributed translations (FR, DE, etc.). |

---

## Technical & Infrastructure

| # | Feature | Effort | Notes |
|---|---|---|---|
| I-04 | **Rate limiting** | M | API Gateway or Lambda-level rate limiting per IP / per token to prevent abuse. |
| I-05 | **DynamoDB TTL for anonymous sessions** | S | Auto-expire anonymous claim sessions after N days using DynamoDB TTL. |
| I-08 | **Error monitoring (Sentry)** | S | Integrate Sentry in the frontend and Lambda functions for error tracking. |
| I-02 | **CI/CD pipeline** | M | GitHub Actions: lint, test, bundle, deploy to staging on PR merge. |
| I-03 | **Staging environment** | M | Separate AWS stack for staging vs production, pointed to by `VITE_API_BASE_URL`. |
| I-09 | **Structured Lambda logging** | S | Emit structured JSON logs from all Lambda handlers for CloudWatch Insights queries. |
| I-01 | **IaC: SAM / CDK template** | L | Full infrastructure-as-code for all Lambda, API Gateway, DynamoDB, S3, Cognito resources. |
| I-10 | **WebSocket / SSE (live scorecard)** | L | Replace polling with API Gateway WebSocket API or SSE for real-time scorecard updates. |
| I-07 | **Cypress component tests** | M | Add component-level Cypress tests alongside existing E2E specs. |
| I-06 | **Storybook component library** | M | Document all UI atoms and molecules in Storybook. |

---

## Integrations

| # | Feature | Effort | Notes |
|---|---|---|---|
| INT-05 | **Tikkie integration** | M | Initiator connects their Tikkie account and can send payment requests directly from a group. Supports splitting costs across members (e.g. shared groceries or entrance fees). Tikkie links are generated via the ABN AMRO Tikkie API and can be sent to members via WhatsApp or the share link. Related to T-12 (per-task claim action). |
| INT-01 | **Google Calendar event link** | S | Link a task group to a Google Calendar event; show event details in GroupHeader. |
| INT-04 | **iCal export** | S | Export the event date as an .ics file so members can add it to their calendar. |
| INT-03 | **Slack notification** | M | Post a message to a Slack channel when a task is claimed or when the list is complete. |
| INT-02 | **Zapier / Make connector** | L | Trigger a Zap when a task is claimed (e.g. add row to Google Sheets). |
