# Product Roadmap — wieDoetHet

**Last Updated:** 2026-09-11 (added Milestone 1.10 — Infrastructure as Code (CDK Adoption); 2026-08-20 added Milestone 1.9 — Admin Section, and the Admin Service under 1.7)

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

> **Reality check (2026-08-20):** the line above describes the original plan, not what's deployed. In practice, auth is a hand-rolled JWT (HS256 via Node's `node:crypto`, see `lambda/shared/jwt.js`) — there is no Cognito. Deployment is fully manual: esbuild bundle → zip → Lambda console upload, with `openapi.yaml` (repo root) manually re-imported into API Gateway — there is no CloudFormation/SAM template. See `lambda/DYNAMODB_SETUP.md` and `product/specs/admin-api.spec.md` for the current, accurate picture. Left here rather than rewritten so the drift is visible; a full pass to correct this milestone's write-up is tech debt, not part of the Admin Section feature.
>
> **Update (2026-09-11):** the no-IaC gap flagged above caused a real production incident (a GSI3 fix silently never reached the `production` alias). See Milestone 1.10 — Infrastructure as Code (CDK Adoption) below for the remediation now underway.

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

#### Admin Service (`/admin`) — internal, role-gated read-only CRM
- [ ] `GET /admin/stats` — platform-wide counts and recent activity (admin only)
- [ ] `GET /admin/users` — paginated/searchable user list (admin only)
- [ ] `GET /admin/users/{userId}` — user detail (admin only)
- [ ] `GET /admin/groups` — paginated/searchable group list (admin only)
- [ ] `GET /admin/groups/{groupId}` — group detail (admin only)
- [ ] Authorization re-fetches the caller's User record on every request and checks `role === 'admin'` server-side — no admin claim in the JWT itself (see `product/specs/admin-api.spec.md`)
- [ ] See Milestone 1.9 for the full feature breakdown (data model, GSI3, backfill prerequisite)

#### Infrastructure & Shared
- [ ] DynamoDB table design: `Groups`, `Tasks`, `Claims`, `Users` (single-table or multi-table)
- [ ] API Gateway HTTP API with CORS configured for the Vue SPA origin
- [ ] Cognito User Pool + App Client for JWT-based auth
- [ ] S3 bucket for group pictures with pre-signed upload URLs
- [ ] Lambda authorizer middleware for JWT validation on protected routes
- [ ] SAM template (`template.yaml`) for all Lambda functions and API Gateway
- [ ] `npm run deploy` script via AWS SAM CLI
- [ ] Local development: `sam local start-api` mapped to `VITE_API_BASE_URL=http://localhost:3000`
- [ ] GSI3 added to `wdh-main` (constant-per-type partition key `USER`/`GROUP`, sort key `{createdAt}#{id}`) — enables native `Query`-based pagination for admin listings without a table `Scan`

### Milestone 1.8 — Polish & PWA
- [ ] PWA manifest and service worker
- [ ] "Add to homescreen" prompt
- [ ] Responsive mobile-first polish
- [ ] Full Dutch i18n + English fallback

### Milestone 1.9 — Admin Section (internal CRM, read-only v1)

**Goal:** Give internal admins a read-only oversight view of platform data (users, groups, activity) without needing direct AWS console access for routine questions.

**Data model**
- [ ] `role: 'admin' | 'user'` added to the `User` entity, default `'user'` (see `product/data-model.md`)
- [ ] First admin seeded by manually editing their DynamoDB item — no Cognito, no invite flow, no promote-to-admin UI in v1
- [ ] New GSI3 on `wdh-main` (`GSI3PK = 'USER'|'GROUP'`, `GSI3SK = {createdAt}#{id}`) for native paginated listing of users/groups, avoiding a full-table `Scan`
- [ ] **Deployment prerequisite — flagged, not built in this run:** if `wdh-main` already holds production data, existing User/Group items predate GSI3 and won't appear in admin listings until a one-time backfill script populates `GSI3PK`/`GSI3SK` on them. Confirm with the user whether real data exists before this ships.

**Backend** — see `product/specs/admin-api.spec.md`
- [ ] `wiedoethet-admin` Lambda: `GET /admin/stats`, `GET /admin/users`, `GET /admin/users/{userId}`, `GET /admin/groups`, `GET /admin/groups/{groupId}`

**Frontend** — spec'd separately in a later session (`admin.spec.md`)
- [ ] Admin-gated routes, e.g. `/admin`, `/admin/users`, `/admin/users/:id`, `/admin/groups`, `/admin/groups/:id`
- [ ] Stats dashboard view
- [ ] Users list (search + pagination) and detail view
- [ ] Groups list (search + pagination) and detail view

**Explicitly out of scope for v1:** editing, deactivating, or deleting users/groups from the panel; promote-to-admin UI; any invite-based admin onboarding.

---

### Milestone 1.10 — Infrastructure as Code (CDK Adoption)

**Goal:** End the fully-manual deployment process flagged as tech debt in the
Milestone 1.7 Reality check below, by bringing the already-live AWS resources
under CDK/CloudFormation management — without recreating or duplicating
anything. See `infra/DESIGN.md` and `infra/IMPORT_CHECKLIST.md` for the full
design and step-by-step adoption checklist; `product/specs/infra-cdk-import.spec.md`
for the spec.

**Triggering incident:** a GSI3-related fix shipped to `wiedoethet-auth` and
`wiedoethet-groups`'s `$LATEST`/`development` alias but never reached the
manually-pinned `production` alias, because there was no reliable deployment
process and no record of what was actually running where. Every user/group
created in production since GSI3 was added was invisible in `/admin/*` as a
result.

**Approach:** `cdk import` — write CDK constructs that describe the existing
DynamoDB tables, Lambda functions/aliases, and API Gateway REST API exactly as
they exist live, then adopt them into CloudFormation via `cdk import` rather
than replacing them.

- [ ] `wdh-main` and `wdh-dev` DynamoDB tables imported as-is (`RemovalPolicy.RETAIN`)
- [ ] `wiedoethet-auth`, `wiedoethet-groups`, `wiedoethet-tasks`,
  `wiedoethet-claims`, `wiedoethet-admin` Lambda functions imported with their
  `development` (tracks `$LATEST`) and `production` (pinned version) aliases
- [ ] wieDoetHet API Gateway REST API imported complete and as-is via an
  exported OpenAPI body — **pending empirical confirmation that
  `AWS::ApiGateway::RestApi`/`Deployment`/`Stage` support CloudFormation
  import at all** (see DESIGN.md §4.7); falls back to "described but not yet
  CDK-managed" for this resource if unsupported
- [ ] `lambda/package.json` gains a `build` script so `infra/`'s predeploy
  hook can bundle fresh code before every synth/import/deploy

**Explicitly out of scope for this milestone, tracked as follow-ups:**
- `wiedoethet-whatsapp` and `wiedoethet-reminders` — wired into the live API
  Gateway but have no recovered source code in this repo; excluded from
  Lambda management until source is recovered
- Properly wiring `wdh-dev` (currently provisioned but functionally unused —
  every function resolves to `wdh-main` regardless of alias)
- Reproducing Lambda execution roles' inline IAM policies as CDK-managed
  resources (referenced read-only via `fromRoleArn` for now)
- Enabling Point-in-Time Recovery on either DynamoDB table

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
