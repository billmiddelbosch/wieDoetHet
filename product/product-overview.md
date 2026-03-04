# Product Overview — wieDoetHet

**Last Updated:** 2026-03-03
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

---

## Out of Scope (Not MVP)

- Task "sell-off" / transfer feature
- Payment integration
- Real-time collaboration (WebSocket live updates — MVP uses polling or manual refresh)
- File attachments on tasks
- Task comments/discussion threads

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
