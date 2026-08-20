# Vision — Admin Section

**Status:** VISION complete, SPEC (backend) complete. DESIGN/IMPLEMENT/TEST/REVIEW/PACKAGE/VALIDATE/COMMIT not yet started.
**Last Updated:** 2026-08-20

---

## Business Problem

wieDoetHet has no internal visibility into its own data. Every question about the platform — how many users signed up this week, whether a specific group's initiator ever came back, whether growth is real or a handful of test groups — currently requires opening the AWS Console and reading DynamoDB items by hand. That doesn't scale past the first few dozen groups, and it means the only people who *can* answer those questions are whoever has AWS credentials, not whoever actually needs to know.

The Admin Section solves this with an internal, role-gated panel inside the existing product: a small set of authenticated team members get a read-only window into users, groups, and platform activity, without needing AWS access for routine questions.

## User Workflows Affected

- **Administrator** (new role, not a new user-facing persona — an internal team member): logs in through the exact same login form every registered user uses. If their account has `role: 'admin'`, they can additionally reach `/admin/*` routes in the SPA. There is no separate admin login, no separate credential system.
- **Initiator / Member workflows are unaffected.** Nothing about group creation, task claiming, or the public share-link flow changes. The `role` field is additive to `User` and defaults to `'user'` — every existing account behaves identically to today until someone is manually promoted.

## Integration Points

- **Frontend (Vue 3 SPA):** new admin-gated routes and views. Out of scope for this run — a separate `admin.spec.md` will be produced in a later session covering the UI side (dashboard, users list/detail, groups list/detail, navigation guard on `role`).
- **Backend:** one new Lambda, `wiedoethet-admin`, following the exact structural pattern of `wiedoethet-groups` (single `index.js`, regex method+path router, per-file `requireAuth`-style guard, an "enrich" pattern for batch-fetching rollups). See `product/specs/admin-api.spec.md` for the full contract — this is the deliverable of this run's SPEC stage.
- **Two existing Lambdas gain a small write-path change:** `wiedoethet-auth`'s `register()` and `wiedoethet-groups`'s `createGroup()` must start writing `GSI3PK`/`GSI3SK` on every new User/Group item so the admin panel can list them. Existing `stripKeys()`/`safeUser()` helpers in both files must also be updated to omit those new attributes from public API responses — otherwise raw DynamoDB key material leaks into `/auth/*` and `/groups/*` responses.
- **DynamoDB (`wdh-main`):** new GSI3, added to the existing single-table design alongside GSI1/GSI2.
- **API Gateway / `openapi.yaml`:** five new `/admin/*` paths, integrated the same way every other path is (manual `x-amazon-apigateway-integration` blocks, no CDK).

## Dependencies, Risk, and Scalability Constraints

- **No token re-issuance dependency.** Admin authorization deliberately does NOT add a role claim to the JWT (which would require re-issuing tokens for every existing session). Instead, every admin request re-fetches the caller's `User` record via `getItem` and checks `role === 'admin'` server-side. Trade-off accepted: one extra DynamoDB read per admin request, in exchange for zero disruption to existing sessions and zero risk of a stale/forged role claim living inside a long-lived JWT.
- **Scan avoidance is the central architectural constraint.** `wdh-main` is single-table and shared by Users, Groups, Tasks, and Claims. Listing "all users" or "all groups" without a purpose-built index would mean a `Scan` over the *entire* table — cost proportional to every task and claim in the system, not just the users/groups being listed. GSI3 (constant-per-type partition key, `{createdAt}#{id}` sort key) turns that into a `Query`, cost-proportional only to the entity type being listed. This mirrors the existing GSI2 pattern (`INITIATOR#{userId}` → that user's groups) — same idea, applied at the "all of type X" scale instead of "one user's slice."
- **Deployment prerequisite — must be confirmed before this ships:** if `wdh-main` already holds real production User/Group data, those existing items were written before GSI3 existed and will have neither `GSI3PK` nor `GSI3SK`. DynamoDB GSIs only index items that carry the indexed attributes — items missing them are silently absent from GSI3 queries. Until a one-time backfill script populates `GSI3PK`/`GSI3SK` on every existing User and Group item, the admin panel's listings and stats will under-report actual platform data with no visible error. **This backfill script is intentionally not written in this run** — it needs to be scoped and run as a deployment step, and the user should confirm whether `wdh-main` currently holds real data before DESIGN/IMPLEMENT proceeds.
- **Search is FilterExpression-based, not full-text.** DynamoDB has no substring index. `/admin/users?q=` and `/admin/groups?q=` apply a `FilterExpression` (`contains(...)`) against the GSI3 partition for that entity type — cost-proportional to that entity type's total count, not the whole table, but still not a true search index. Acceptable at current and near-term scale; OpenSearch/similar would be the answer if this becomes a bottleneck, and is explicitly out of scope for v1.
- **`totalTasks`/`totalClaims` are out of the v1 stats dashboard**, for the same reason: no GSI3 partition exists for those entity types, so counting them would mean the exact table-wide `Scan` this feature exists to avoid. Flagged as future work, not silently scanned.

## Event Sources

Single event source for the new function: **API Gateway REST API, proxy integration (`aws_proxy`)**. All five `/admin/*` routes are synchronous, request/response, GET-only in v1 (read-only scope). No S3, SQS, SNS, DynamoDB Streams, or CloudWatch Events involvement.

## Data Model Changes (summary — full detail in `product/data-model.md`)

- `User.role: 'admin' | 'user'`, default `'user'`.
- New GSI3 on `wdh-main`: `GSI3PK = 'USER' | 'GROUP'`, `GSI3SK = {createdAt ISO8601}#{id}`.
- New read-only computed shapes: `AdminUserSummary`, `AdminUserDetail`, `AdminGroupSummary`, `AdminGroupDetail`, `AdminStats` — none persisted, all derived at request time.

## Explicit v1 Scope Boundary

**In scope:** read-only browse of users and groups (search, paginate, view detail) plus a stats dashboard. Access gated by `role === 'admin'`, checked server-side per request.

**Out of scope (documented so it isn't silently assumed later):**
- Editing, deactivating, or deleting users/groups from the admin panel
- Promote-to-admin UI or any invite-based admin onboarding — v1 promotion is a manual DynamoDB item edit
- Cognito or any third-party IdP — admins use the same hand-rolled JWT login as every other user
- Full-text/fuzzy search — v1 search is a DynamoDB `FilterExpression` substring match, not a search index
- `totalTasks`/`totalClaims` in the stats dashboard — no supporting index exists yet
- The one-time GSI3 backfill script for pre-existing production data — flagged as a deployment prerequisite, not built in this run
- Frontend implementation — covered by a separate `admin.spec.md` in a later session

## Deployment Reality (repo-wide correction, relevant to every stage that follows)

This repo has **no CDK/IaC of any kind**, despite what `product/product-roadmap.md`'s Milestone 1.7 header still says (Cognito, CloudFormation/SAM — aspirational text never implemented). The actual deployment path, which every future stage of this feature must follow:

- Manual esbuild bundle (`lambda/package.json`'s `bundle:*` scripts) → manual zip → manual upload via the Lambda console
- `openapi.yaml` (repo root) manually re-imported into API Gateway after every path change
- IAM via one shared policy file, `lambda/iam-policy-dynamodb.json`, not per-function policies
- No unit-test framework, no staging environment — "testing" means realistic JSON payloads for manual AWS Console / Postman use (`lambda/<fn>/tests/*.json`, `lambda/api-gateway-tests/*.json`)

Full stage-by-stage substitutions (DESIGN, IMPLEMENT, TEST, PACKAGE, VALIDATE) are documented in `product/specs/admin-api.spec.md` so whoever picks this up next doesn't default back to the CDK-based pipeline assumptions.

## Next Steps

1. **DESIGN** (backend): flesh out `lambda/wiedoethet-admin/` file structure, update `lambda/DYNAMODB_SETUP.md` with GSI3, add the five `/admin/*` paths to `openapi.yaml`.
2. **DESIGN/SPEC** (frontend, separate session): `admin.spec.md` — routes, views, nav guard on `role`, component contracts.
3. Confirm with the user whether `wdh-main` holds real production data, to decide if/when the GSI3 backfill script needs to be written and run before this feature can go live.
