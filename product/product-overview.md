# Product Overview — wieDoetHet

**Last Updated:** 2026-09-20 (added Mail automation — lifecycle mails, opt-out and the Admin → Automatisering panel; see § 8 below. Prior 2026-09-15 entry: added Admin Mail Users — the Admin Section's first non-read-only capability; see
§ 8 below. Prior 2026-08-20 entry: added Admin Section.)
**Version:** 0.1.0 (MVP)

---

## What is wieDoetHet?

"wieDoetHet" (Dutch: "who does it") is a lightweight, mobile-first Dutch task-assignment platform. It enables a group organiser (the **initiator**) to create a list of tasks and invite group members to individually claim which task(s) they want to do — all without requiring every participant to have an account.

The primary use case is informal group coordination: organising a communal dinner, dividing household chores, splitting contributions for a birthday party, assigning roles for a school project, and similar real-world scenarios where a WhatsApp group already exists but task ownership is unclear.

---

## Core Problem

When groups need to divide tasks, coordination typically happens chaotically through messaging apps: people forget what they signed up for, duplicate efforts occur, and some tasks go unclaimed. wieDoetHet makes task assignment explicit, visible, and effortless.

---

## Target Users

| Role | Description |
|---|---|
| **Initiator** | The person who creates the group and task list. Has full control over settings and visibility. |
| **Member (anonymous)** | A participant who receives a share link. Can view and claim tasks without an account. |
| **Member (registered)** | A participant with an account. Can see all groups they belong to and manage settings. |
| **Administrator** | An internal team member — a registered account with `role: 'admin'`. Not a group participant; uses a separate internal panel to monitor platform health (users, groups, activity). Granted manually, not self-serve. |

---

## Feature Set (MVP)

### 1. Landing Page
- Explains the product value proposition in Dutch
- Shows how it works (3-step visual flow)
- Call-to-action to create a group
- PWA install prompt ("voeg toe aan beginscherm")
- Inspired by clean, friendly UI similar to weibetaaldwat.nl

### 2. Authentication
- **Anonymous access**: Anyone with a share link can view a task list and claim tasks without an account
- **Registered account**: Email + password registration and login
- Registered users see a dashboard of all their groups

### 3. Groups
- Initiator creates a group with: name, optional picture, visibility preferences
- Groups can be marked as temporary (auto-expire) or permanent
- Each group gets a unique, shareable short link
- Initiator can configure: whether members must claim at least one task, or can skip all

### 4. Tasks
- Initiator creates tasks within a group
- Each task has: title, description (optional), optional max capacity (how many people can claim it)
- Tasks are ordered and can be reordered by initiator
- Users can claim one or more tasks
- Visual indication of: claimed / partially claimed / unclaimed / full status

### 5. Task Claiming
- Members open the share link and see the task list
- Members provide their name (anonymous) or are identified by account
- Members click to claim a task; click again to unclaim
- If a task has max capacity, it locks once full
- Initiator can choose: must select at least 1, or optional

### 6. Scorecard / Visibility
- Live overview of who claimed what
- Initiator controls visibility:
  - All group members can see
  - Selected users only
  - Only the initiator

### 7. WhatsApp Integration
- Initiator sends invitations and reminders via WhatsApp deep link
- Share link included in the WhatsApp message template
- Initiator configures reminder timing (e.g. send reminder 1 day before event)

### 8. Admin Section (Internal)
- Separate, role-gated internal panel — not part of the public-facing product surface
- Access requires `role: 'admin'` on the signed-in user's account; the first admin is granted by editing their DynamoDB item directly (no invite flow, no self-serve promotion in v1)
- **Stats dashboard**: platform-wide counts (users, groups) and recent signup/group-creation activity, at a glance
- **User browser**: searchable, paginated list of registered users (email, name, signup date, group count, last activity) with a detail view per user
- **Group browser**: searchable, paginated list of groups with a detail view per group
- **Mail Users** (branch `feature/admin-mail-users`, status: implementation complete, pending review/validation):
  from the user list, an admin selects one or more users via checkboxes — or a server-resolved "select all N
  matching current filter" — and composes a rich-text (HTML) email sent via AWS SES to every selected
  recipient. This is the panel's one deliberate exception to read-only v1: it does not edit/deactivate/delete
  any user or group record, it only sends outbound email, so it does not reopen the "no editing" scope
  decision below.
- Otherwise v1 remains **read-only** with respect to user/group *data* — no editing, deactivating, or deleting
  users/groups from the panel (Mail Users sends email, it does not touch stored records)
- **Mail automation** (branch `feature/mailAutomation`, status: implementation complete, pending review and
  first live run — nothing is deployed and everything ships switched off): a scheduled job sends lifecycle
  mails to registered users to stimulate use and reduce churn. Mails go out on weekday mornings at 10:00
  (Europe/Amsterdam) — the moments people read private mail most; the follow-ups only Tuesday–Thursday.
  - v1 templates: **welcome** (day after registration, skipped when the user already made a group on day 1),
    **no group** (48 h after registration), **group without tasks** / **tasks without claims** (4 days after
    the first task), **day after the event**, and **dormant** at 30 and 60 days.
  - Rules: conditions are re-checked at send time; one mail per user per run and at least 72 h between mails;
    a mail stops as soon as the user acts; at most two unanswered win-back mails, then silence; admins and
    opted-out users never get lifecycle mail.
  - Every mail carries a footer that invites suggestions and explains the opt-out. Users simply reply to the
    mail; an admin records the opt-out on the user (Admin → Users → user → *E-mailvoorkeuren*) and answers
    suggestions manually. Opted-out users are also skipped by the manual Mail Users feature.
  - Admin → **Automatisering**: per-template on/off switch, editable subject/body per template (with reset to
    the default text and a test mail to yourself), and a sent-mail log (template, recipient, status, attempts).
    A master kill switch (`LIFECYCLE_MAIL_ENABLED`) and a per-run send cap sit outside the panel.
  - Deferred to a later version: "event approaching" and "everything claimed" mails.
  - Specs: `product/specs/mail-automation.spec.md` (UI + rules), `product/specs/mail-automation-api.spec.md` (backend).

---

## Out of Scope (Not MVP)

- Task "sell-off" / transfer feature
- Payment integration
- Real-time collaboration (WebSocket live updates — MVP uses polling or manual refresh)
- File attachments on tasks
- Task comments/discussion threads
- Admin: editing/deactivating/deleting users or groups from the panel
- Admin: promote-to-admin UI or invite flow (v1 promotion is a manual DynamoDB edit)
- Admin: Cognito or any third-party IdP for admin login — admins authenticate through the same hand-rolled JWT login as everyone else; the panel is gated purely by the `role` field

---

## Success Metrics (MVP)

- A group can be created and a share link generated in under 2 minutes
- Anonymous users can claim tasks without friction (no signup required)
- Initiator can see full scorecard at any time
- WhatsApp share link works on mobile without any extra steps

---

## Design Principles

- **Mobile-first**: Designed primarily for smartphone use via WhatsApp-shared links
- **Low friction**: Anonymous participation is a first-class citizen
- **Dutch-first**: Default language is Dutch; English fallback
- **Clarity**: Task status is always visually unambiguous
- **Privacy**: Initiator controls what others can see
