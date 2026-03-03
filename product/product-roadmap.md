# Product Roadmap — wieDoetHet

**Last Updated:** 2026-03-03 (added Milestone 1.7 — AWS Lambda backend services)

---

## Phase 1 — MVP (Current)

**Goal:** Core task-claiming loop working end-to-end for a single group, shareable via WhatsApp.

### Milestone 1.1 — Foundation
- [x] Vue 3 + Vite + Pinia + Router + Tailwind v4 scaffold
- [ ] Design tokens and app shell
- [ ] Landing page (value prop, CTA, PWA prompt)
- [ ] Default layout with nav

### Milestone 1.2 — Auth
- [ ] Anonymous user flow (name-only, stored in localStorage)
- [ ] Registered user registration (email + password)
- [ ] Registered user login
- [ ] Auth store (useAuthStore)
- [ ] Protected routes (initiator dashboard)

### Milestone 1.3 — Groups
- [ ] Group creation form (name, picture, preferences)
- [ ] Unique shareable link generation
- [ ] Group list view (registered users)
- [ ] Group detail view (task list within group)
- [ ] Group settings (visibility, task-claim requirements)

### Milestone 1.4 — Tasks
- [ ] Task creation form (title, description, max capacity)
- [ ] Task list display with status indicators
- [ ] Task claiming / unclaiming
- [ ] Capacity enforcement (lock when full)
- [ ] "Must claim at least one" enforcement

### Milestone 1.5 — Scorecard
- [ ] Scorecard view showing who claimed what
- [ ] Visibility control (all / selected / initiator only)
- [ ] Real-time-like refresh (manual or polling)

### Milestone 1.6 — WhatsApp Integration
- [ ] Share link generation with WhatsApp deep link
- [ ] WhatsApp message template with group invite
- [ ] Reminder notification configuration by initiator

### Milestone 1.7 — Backend: AWS Lambda (Node.js) Services

**Goal:** Serverless REST API on AWS that the Vue SPA consumes via the configured Axios instance.

**Infrastructure stack:** AWS Lambda + API Gateway (HTTP API) + DynamoDB + S3 (group pictures) + Cognito (auth) + CloudFormation / SAM for IaC.

#### Auth Service (`/auth`)
- [ ] `POST /auth/register` — create Cognito user + DynamoDB profile record
- [ ] `POST /auth/login` — Cognito InitiateAuth, return JWT access token
- [ ] `POST /auth/logout` — invalidate refresh token
- [ ] `GET /auth/me` — return current user profile from DynamoDB

#### Groups Service (`/groups`)
- [ ] `POST /groups` — create group, generate unique share token, persist to DynamoDB
- [ ] `GET /groups` — list all groups for authenticated initiator
- [ ] `GET /groups/:groupId` — get group by ID (public via share token, no auth required)
- [ ] `GET /groups/share/:shareToken` — resolve share token to group (anonymous access)
- [ ] `PATCH /groups/:groupId` — update group settings (name, picture, preferences)
- [ ] `DELETE /groups/:groupId` — soft-delete group (initiator only)
- [ ] `POST /groups/:groupId/picture` — upload group picture to S3, store URL

#### Tasks Service (`/groups/:groupId/tasks`)
- [ ] `GET /groups/:groupId/tasks` — list all tasks in a group (public via share token)
- [ ] `POST /groups/:groupId/tasks` — create task (initiator only)
- [ ] `PATCH /groups/:groupId/tasks/:taskId` — update task (title, description, capacity)
- [ ] `DELETE /groups/:groupId/tasks/:taskId` — delete task (initiator only)
- [ ] `PATCH /groups/:groupId/tasks/order` — reorder tasks (initiator only)

#### Claims Service (`/groups/:groupId/claims`)
- [ ] `GET /groups/:groupId/claims` — get all claims for a group (scorecard data)
- [ ] `POST /groups/:groupId/tasks/:taskId/claim` — claim a task (anonymous name or JWT)
- [ ] `DELETE /groups/:groupId/tasks/:taskId/claim` — unclaim a task

#### WhatsApp Notification Service (`/notifications`)
- [ ] `POST /notifications/whatsapp/invite` — generate WhatsApp deep-link payload with share URL
- [ ] `POST /notifications/whatsapp/reminder` — schedule a reminder Lambda (EventBridge rule) and generate WhatsApp deep-link

#### Infrastructure & Shared
- [ ] DynamoDB table design: `Groups`, `Tasks`, `Claims`, `Users` (single-table or multi-table)
- [ ] API Gateway HTTP API with CORS configured for the Vue SPA origin
- [ ] Cognito User Pool + App Client for JWT-based auth
- [ ] S3 bucket for group pictures with pre-signed upload URLs
- [ ] Lambda authorizer middleware for JWT validation on protected routes
- [ ] SAM template (`template.yaml`) for all Lambda functions and API Gateway
- [ ] `npm run deploy` script via AWS SAM CLI
- [ ] Local development: `sam local start-api` mapped to `VITE_API_BASE_URL=http://localhost:3000`

### Milestone 1.8 — Polish & PWA
- [ ] PWA manifest and service worker
- [ ] "Add to homescreen" prompt
- [ ] Responsive mobile-first polish
- [ ] Full Dutch i18n + English fallback

---

## Phase 2 — Post-MVP Enhancements

**Goal:** Improve retention, real-time experience, and social features.

- [ ] Real-time live updates via WebSocket / SSE
- [ ] Push notifications (PWA)
- [ ] Email notifications as alternative to WhatsApp
- [ ] Task templates (reuse a task list across multiple events)
- [ ] Group member roster management by initiator
- [ ] Recurring tasks / recurring groups
- [ ] Activity log (who claimed/unclaimed when)

---

## Phase 3 — Monetisation & Scale

**Goal:** Sustainable product with premium tier.

- [ ] Task "sell-off" feature: transfer a claimed task to another member (initiator-controlled)
- [ ] Premium groups (custom domain, logo branding, larger member limits)
- [ ] API for third-party integrations
- [ ] Analytics dashboard for initiators

---

## Technical Debt Backlog

- Add Cypress component testing
- Add Storybook for UI component documentation
- Migrate from polling to WebSocket for scorecard updates
- Add full error boundary handling
- Accessibility (WCAG 2.1 AA) audit
