# Spec — `wiedoethet-admin` (Admin API, backend only)

**Status:** SPEC complete. DESIGN/IMPLEMENT/TEST/REVIEW/PACKAGE/VALIDATE/COMMIT not yet started.
**Scope of this file:** backend only (one new Lambda + two small write-path changes to existing Lambdas + one new GSI). Frontend routes/views/nav-guard are out of scope — see `admin.spec.md` (separate, later session).
**Last Updated:** 2026-08-20 — initial version.

---

## Deployment Reality Override — read this before DESIGN/IMPLEMENT

This repo has **no CDK/IaC**. Every generic pipeline assumption of `NodejsFunction`, `cdk synth`, `cdk deploy`, and `infra/DEPLOYMENT.md` **does not apply** to this project. The actual substitutions, stage by stage:

| Generic pipeline stage | What actually happens in wieDoetHet |
|---|---|
| **DESIGN** | No CDK constructs. New function directory `lambda/wiedoethet-admin/` matching `lambda/wiedoethet-groups/`'s structure (single `index.js`, no subfolders except `tests/`). DynamoDB changes documented as an update to `lambda/DYNAMODB_SETUP.md` (add a "GSI3" section matching the existing GSI1/GSI2 sections). API Gateway integration = five new paths appended to root `openapi.yaml`, each with its own `x-amazon-apigateway-integration` block in the exact format already used by `/groups`, `/auth/*`, etc. |
| **IMPLEMENT** | No `infra/` files of any kind. IAM changes are an edit to the one shared `lambda/iam-policy-dynamodb.json` (see IAM Permissions below) — **not** a new per-function policy file, despite what the generic pipeline template implies. Test payloads go in `lambda/wiedoethet-admin/tests/*.json` (mirrors `lambda/wiedoethet-groups/tests/*.json`) plus request/response examples added to `lambda/api-gateway-tests/*.json` and `lambda/api-gateway-tests/wieDoetHet.postman_collection.json`. This repo has **no per-endpoint `*.apigateway-model.json` files anywhere** — that convention was never adopted here; don't introduce it for this feature alone. |
| **TEST** | No unit-test framework, no staging environment. "Testing" means realistic JSON event payloads for manual AWS Lambda console **Test** tab and manual API Gateway **Method Test** / Postman use. |
| **PACKAGE** | No `cdk synth`. Add a `bundle:admin` script to `lambda/package.json` matching the existing esbuild pattern exactly: `esbuild wiedoethet-admin/index.js --bundle --platform=node --target=node24 --external:@aws-sdk/* --outfile=dist/wiedoethet-admin/index.js --format=cjs`, and add it to the aggregate `bundle` script. Manual zip of `dist/wiedoethet-admin/` → manual upload via Lambda console. No `infra/DEPLOYMENT.md` to update — this repo has no such file; deployment notes belong in `lambda/DYNAMODB_SETUP.md` (schema) and `lambda/api-gateway-tests/README.md` (API testing), both of which already exist and follow this pattern. |
| **VALIDATE** | No `cdk deploy`. Manual confirmation: function uploaded, `openapi.yaml` re-imported into API Gateway, environment variables set on the function (`TABLE_NAME`, `JWT_SECRET`), a manual console test of each of the five routes against a real admin account. |

---

## Function Purpose

Give internal team members a read-only, role-gated window into platform data — registered users, groups, and basic activity stats — without requiring AWS Console access for routine questions. This is the backend half of the "Admin Section" feature described in `vision.md`. It introduces one new Lambda (`wiedoethet-admin`) and depends on a new GSI3 index that two *existing* write paths must start populating (documented below, not implemented in this SPEC stage).

Strictly read-only in v1: no create/update/delete routes, no promote-to-admin route. Access is gated by `User.role === 'admin'`, re-checked server-side on every request (no role claim in the JWT — see `vision.md` § Dependencies, Risk, and Scalability Constraints for why).

## Handler Name

`wiedoethet-admin` — file `lambda/wiedoethet-admin/index.js`, exported `handler` function (`index.handler`), same shape as `wiedoethet-groups`/`wiedoethet-auth`.

## Runtime

- Node.js 24.x (`nodejs24.x`), ES modules (`"type": "module"` — matches `lambda/package.json`)
- AWS SDK v3, modular imports only (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`) — no new dependencies required
- Plain JavaScript, not TypeScript — this repo's Lambda backend has no TS anywhere (`lambda/**/*.js` throughout); handler signatures below are documented with JSDoc-style comments to match the existing header-comment convention in `wiedoethet-groups/index.js` and `wiedoethet-auth/index.js`, not enforced by a compiler

## Event Source

API Gateway REST API, proxy integration (`aws_proxy`) — identical mechanism to every other function in this repo. Synchronous request/response. All five routes are `GET`, no request body on any of them.

```
GET /admin/stats
GET /admin/users
GET /admin/users/{userId}
GET /admin/groups
GET /admin/groups/{groupId}
```

## Handler Signature

```js
/**
 * Admin Lambda — handles:
 *   GET /admin/stats
 *   GET /admin/users
 *   GET /admin/users/{userId}
 *   GET /admin/groups
 *   GET /admin/groups/{groupId}
 *
 * Function name: wiedoethet-admin
 * Runtime: nodejs24.x
 * Handler: index.handler
 */

// event: APIGatewayProxyEvent (REST API, aws_proxy integration) — same shape wiedoethet-groups/wiedoethet-auth already receive
// context: Lambda Context — unused, matches existing functions (no use of context.* anywhere in this repo's handlers)
// returns: Promise<APIGatewayProxyResult> — { statusCode, headers, body } via lambda/shared/http.js helpers
export const handler = async (event) => { /* method+path regex router, same pattern as wiedoethet-groups */ }
```

### Route handler signatures

```js
async function getStats(event)                 // GET /admin/stats           -> AdminStats
async function listUsers(event)                 // GET /admin/users           -> { items: AdminUserSummary[], nextCursor: string|null }
async function getUserDetail(event)             // GET /admin/users/{userId}  -> AdminUserDetail
async function listGroups(event)                // GET /admin/groups          -> { items: AdminGroupSummary[], nextCursor: string|null }
async function getGroupDetail(event)            // GET /admin/groups/{groupId} -> AdminGroupDetail
```

`AdminStats`, `AdminUserSummary`, `AdminUserDetail`, `AdminGroupSummary`, `AdminGroupDetail` shapes are already defined in `product/data-model.md` § Admin Read Models — this spec does not redefine them, only how they're produced.

**Deliberate deviation from existing convention:** every other list endpoint in this repo (`GET /groups`, `GET /groups/:id/tasks`) returns a bare array via `ok(array)`. The two admin list endpoints instead return `{ items, nextCursor }` because they are paginated (cursor-based, see DynamoDB Integration below) and every other list endpoint in this repo is not. Flag this explicitly in code review — it is intentional, not an oversight.

### Query parameters

| Param | Applies to | Type | Default | Notes |
|---|---|---|---|---|
| `limit` | `/admin/users`, `/admin/groups` | integer string | `20` | Max `50`. Values outside `1–50` → `400 Bad Request`. Capped at 50 deliberately — see Performance § fan-out cost. |
| `cursor` | `/admin/users`, `/admin/groups` | opaque base64url string | none | Echoes back `nextCursor` from a prior page. Malformed/undecodable cursor → `400 Bad Request`. Opaque to clients — encodes DynamoDB's `LastEvaluatedKey`, see below. |
| `q` | `/admin/users`, `/admin/groups` | string | none | Substring filter, see Known Limitations. Empty string treated as "not provided". |

## Environment Variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `TABLE_NAME` | No | `wdh-main` (via `event.stageVariables?.tableName ?? process.env.TABLE_NAME ?? 'wdh-main'`) | Same fallback pattern as `wiedoethet-groups`/`wiedoethet-auth` — copy the exact line from either file's `handler`. |
| `JWT_SECRET` | **Yes** | none — throws if unset | Consumed by `lambda/shared/jwt.js`'s `verifyJwt()`, which `requireAdmin` calls. This function only ever *verifies* tokens (never signs), so `JWT_EXPIRES_SEC` is irrelevant here. |

## IAM Permissions

**This repo uses one shared IAM policy file for all four (soon five) Lambda functions — `lambda/iam-policy-dynamodb.json` — not per-function policies.** `wiedoethet-admin` does not get its own `*.iam-policy.json`; it is granted access by being covered by the existing shared policy, which must be edited (not replaced) as part of this feature.

**Required change:** append the GSI3 index ARNs (both tables) to the existing `WdhDynamoDBIndexAccess` statement's `Resource` array:

```
arn:aws:dynamodb:eu-west-2:344050431068:table/wdh-main/index/GSI3
arn:aws:dynamodb:eu-west-2:344050431068:table/wdh-dev/index/GSI3
```

No other change to the policy file is needed — `GetItem` and `Query` on the base table (both `wdh-main` and `wdh-dev`) and `Query` on GSI1/GSI2 are already granted and cover everything `wiedoethet-admin` needs below.

**Actions this function actually uses** (documented for the record — the shared policy already grants more than this, including write actions this read-only function never calls; that's an accepted pre-existing repo convention, not something to fix in this feature):

| Action | Target | Used for |
|---|---|---|
| `dynamodb:GetItem` | `wdh-main` (base table) | `requireAdmin`'s self-lookup; `GET /admin/users/{userId}`; `GET /admin/groups/{groupId}`; per-group initiator lookup during group enrichment |
| `dynamodb:Query` | `wdh-main` (base table, `PK`/`SK`) | Tasks in a group (`GROUP#{id}` + `SK` begins_with `TASK#`) for group detail |
| `dynamodb:Query` | `wdh-main/index/GSI1` | Claims in a group (`GCLAIM#{groupId}`) for group enrichment (task/member counts) |
| `dynamodb:Query` | `wdh-main/index/GSI2` | Groups by initiator (`INITIATOR#{userId}`) for user `groupCount`/`lastActivityAt`/detail |
| `dynamodb:Query` | `wdh-main/index/GSI3` (**new**) | Paginated user/group listings and stats counts |

## DynamoDB Integration

### New GSI3 (spec for `lambda/DYNAMODB_SETUP.md` — DESIGN stage writes the actual doc update)

| Setting | Value |
|---|---|
| Index name | `GSI3` |
| Partition key | `GSI3PK` — String, constant per entity type: `'USER'` or `'GROUP'` |
| Sort key | `GSI3SK` — String, `{createdAt ISO 8601}#{id}` |
| Projection | All attributes (matches GSI1/GSI2) |

This turns "list all users" / "list all groups" into a `Query` (cost proportional to that entity type's item count) instead of a `Scan` (cost proportional to the entire single table — Users + Groups + Tasks + Claims combined). Same design principle as GSI2 (`INITIATOR#{userId}` → one user's groups), applied at "all of type X" scale.

### New key builders for `lambda/shared/db.js`'s `keys` object

```js
userGsi3: (createdAt, id) => ({ GSI3PK: 'USER', GSI3SK: `${createdAt}#${id}` }),
groupGsi3: (createdAt, id) => ({ GSI3PK: 'GROUP', GSI3SK: `${createdAt}#${id}` }),
```

### New `queryGsi3` helper for `lambda/shared/db.js`

**Deliberate deviation from `queryGsi1`/`queryGsi2`'s signature.** Those two return a plain array because every existing caller wants "all matching items, unpaginated" (a user's groups, a group's claims — both naturally small, bounded sets). `wiedoethet-admin` is the first caller that needs cursor pagination, sort direction, an optional filter, and count-only queries — so `queryGsi3` takes an options object and returns `{ items, lastEvaluatedKey, count }` instead of a bare array. Do not retrofit this richer shape onto `queryGsi1`/`queryGsi2` as part of this feature — out of scope, would touch every existing caller for no benefit.

```js
export async function queryGsi3(gsi3pk, {
  skGte,                        // string | undefined — GSI3SK >= this value (used for "last 7 days" range queries)
  limit,                        // number | undefined — DynamoDB Limit (applied BEFORE FilterExpression — see note below)
  exclusiveStartKey,            // object | undefined — decoded LastEvaluatedKey from a prior page
  scanIndexForward = true,      // false = newest-first (admin listings want false; ascending range counts want true or don't care)
  filterExpression,             // string | undefined
  expressionAttributeNames,     // object | undefined
  expressionAttributeValues,    // object | undefined — merged with { ':pk': gsi3pk } (and ':skGte' if skGte set)
  select,                       // 'COUNT' | undefined — for stats endpoint's count-only queries
} = {}) {
  // Builds KeyConditionExpression 'GSI3PK = :pk' (+ 'AND GSI3SK >= :skGte' when skGte set),
  // sends one QueryCommand against IndexName: 'GSI3', returns { items: Items ?? [], lastEvaluatedKey: LastEvaluatedKey ?? null, count: Count }
}
```

**Important DynamoDB gotcha to implement correctly (put in code comments, not just this spec):** `FilterExpression` is applied *after* DynamoDB reads `Limit` items from the index, not after filtering. A filtered query with `limit: 20` can legitimately return fewer than 20 items even though more matches exist later in the index. `listUsers`/`listGroups` must **not** treat `items.length < limit` as "no more pages" when `q` is present — they must check `lastEvaluatedKey === null` instead, and loop internally (bounded — cap at 5 internal `queryGsi3` calls per request) accumulating filtered results until either `limit` items are collected or `lastEvaluatedKey` goes null, so the client-facing page size stays consistent.

### Cursor encoding

`nextCursor` is `lastEvaluatedKey` from the last internal `queryGsi3` call, JSON-stringified and base64url-encoded (mirror the `b64url`/`b64urlDecode` pattern already in `lambda/shared/jwt.js` — don't add a new dependency for this). Local helpers in `wiedoethet-admin/index.js`, not shared — no other function needs cursor pagination:

```js
function encodeCursor(lastEvaluatedKey) {
  return lastEvaluatedKey ? Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64url') : null
}
function decodeCursor(cursor) {
  try { return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) } catch { return undefined /* triggers 400 */ }
}
```

### Access patterns by endpoint

| Endpoint | Queries issued |
|---|---|
| `GET /admin/stats` | `queryGsi3('USER', { select: 'COUNT' })` → `totalUsers`; `queryGsi3('GROUP', { select: 'COUNT' })` → `totalGroups`; `queryGsi3('USER', { skGte: sevenDaysAgoIso, select: 'COUNT' })` → `newUsersLast7d`; `queryGsi3('GROUP', { skGte: sevenDaysAgoIso, select: 'COUNT' })` → `newGroupsLast7d`; `queryGsi3('USER', { scanIndexForward: false, limit: 5 })` → `recentUsers` (then enriched); `queryGsi3('GROUP', { scanIndexForward: false, limit: 5 })` → `recentGroups` (then enriched). All six run via `Promise.all` — independent, no sequencing needed. |
| `GET /admin/users` | `queryGsi3('USER', { scanIndexForward: false, limit, exclusiveStartKey, filterExpression: q ? 'contains(email, :q) OR contains(#name, :q)' : undefined, ... })`, internal-loop per the gotcha above. Each result item enriched with `groupCount`/`lastActivityAt` via `queryGsi2('INITIATOR#' + user.id, 'GROUP#')` (count + max `createdAt`), run in parallel across the page via `Promise.all` — same fan-out shape as `enrichGroup()` in `wiedoethet-groups/index.js`. |
| `GET /admin/users/{userId}` | `getItem('USER#' + userId, 'PROFILE')` → 404 if null; `queryGsi2('INITIATOR#' + userId, 'GROUP#')` for the `groups[]` list, `groupCount`, `lastActivityAt`. |
| `GET /admin/groups` | `queryGsi3('GROUP', { scanIndexForward: false, limit, exclusiveStartKey, filterExpression: q ? 'contains(#name, :q)' : undefined, ... })`, same internal-loop rule. Each page enriched: unique `initiatorId`s resolved via `Promise.all` of `getItem('USER#' + id, 'PROFILE')` (bounded by page size ≤ 50, not a full-table op); `taskCount`/`memberCount` via the same two queries `enrichGroup()` already does (`queryByPk('GROUP#' + id, 'TASK#')`, `queryGsi1('GCLAIM#' + id)`), also parallelized across the page. |
| `GET /admin/groups/{groupId}` | `getItem('GROUP#' + groupId, 'METADATA')` → 404 if null; initiator via `getItem('USER#' + group.initiatorId, 'PROFILE')`; tasks via `queryByPk('GROUP#' + groupId, 'TASK#')`; claims via `queryGsi1('GCLAIM#' + groupId)` — fetched **once** and grouped by `taskId` in memory to compute each task's `claimCount` and the group's `memberCount`, rather than issuing one claims query per task. |

None of these access patterns issue a `Scan`. That is the entire point of GSI3 — flag any `Scan` introduced during IMPLEMENT as a spec violation.

## Related Changes to Existing Functions (documented here, implemented in a later stage)

These are not part of `wiedoethet-admin` itself but are hard dependencies of it — `product/specs/admin-api.spec.md` is the single source of truth for both until this feature ships, since neither `wiedoethet-groups` nor `wiedoethet-auth` has its own spec file today.

### `lambda/wiedoethet-auth/index.js` — `register()`

Add `...keys.userGsi3(now, id)` (i.e. `GSI3PK: 'USER', GSI3SK: `${now}#${id}``) to the item written in `register()` (currently lines 48–59). `now` is already computed (`const now = new Date().toISOString()`) — reuse it, don't call `new Date()` twice.

`safeUser()` (lines 95–98) currently strips `PK, SK, GSI1PK, GSI1SK, passwordHash`. Must be extended to also strip `GSI3PK, GSI3SK` — otherwise raw DynamoDB key material leaks into every `/auth/register`, `/auth/login`, `/auth/me` response body.

### `lambda/wiedoethet-groups/index.js` — `createGroup()`

Add `...keys.groupGsi3(now, id)` to the item written in `createGroup()` (currently lines 48–65). `now` is already computed — reuse it.

`stripKeys()` (lines 141–144) currently strips `PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK`. Must be extended to also strip `GSI3PK, GSI3SK` for the same leakage reason as above. Note `wiedoethet-admin`'s own enrichment functions should use their **own** stripping (or reuse this one via import, DESIGN's call) — either way, GSI3 attributes must never reach an HTTP response body from any of the three functions.

**No other write path needs a GSI3 change.** Tasks and Claims deliberately do not get a GSI3 partition (see `product/data-model.md`'s note on `AdminStats` — counting them would require the `Scan` GSI3 exists to avoid; out of scope for v1).

## Error Handling

| Scenario | Response | Notes |
|---|---|---|
| No `Authorization` header | `401` via `unauthorized()` | Reuse `lambda/shared/http.js` |
| Malformed / expired / bad-signature JWT | `401` via `unauthorized()` | `verifyJwt()` throws → caught, treated same as missing token |
| Valid JWT, but `sub` no longer resolves to a `User` item | `401` via `unauthorized()` | Treated as "not authenticated" (token issued for an account that no longer exists), not "forbidden" |
| Valid JWT, resolved `User` exists, `role !== 'admin'` | `403` via `forbidden()` | Distinguish from the row above — this *is* a real, current user, just not an admin |
| `GET /admin/users/{userId}` — `userId` doesn't resolve to a `User` item | `404` via `notFound()` | |
| `GET /admin/groups/{groupId}` — `groupId` doesn't resolve to a `Group` item | `404` via `notFound()` | |
| `limit` present but not an integer in `1–50` | `400` via `badRequest()` | |
| `cursor` present but fails to base64url-decode / JSON-parse | `400` via `badRequest()` | |
| Unmatched method/path | `404`, `{ message: 'Route niet gevonden' }` | Copy the exact fallback block from `wiedoethet-groups/index.js`'s router |
| Any unexpected exception (DynamoDB throttling, etc.) | `500` via `serverError(err)` | Top-level `try/catch` in `handler`, identical to every other function in this repo |
| `OPTIONS` (CORS preflight) | `204`, CORS headers, empty body | Copy the exact block from `wiedoethet-groups/index.js` line 164 |

### `requireAdmin` contract

```js
async function requireAdmin(event) {
  // returns { user } on success, or { error: <http-response-object> } on failure
  // error is either unauthorized() [no/invalid/expired token, or token's sub no longer resolves]
  // or forbidden() [resolves, but role !== 'admin']
}
```

Every route handler starts with:
```js
const { user: admin, error } = await requireAdmin(event)
if (error) return error
```

This is a deliberate deviation from the existing synchronous `requireAuth(event)` pattern in `wiedoethet-groups`/`wiedoethet-auth` (both return the JWT payload or `null`, no DB call). `requireAdmin` must be `async` because — per `vision.md`'s explicit design decision — the JWT carries no role claim, so every admin request re-fetches the caller's `User` record via `getItem` to check `role`. Also, unlike `requireAuth`, `requireAdmin` must distinguish two different failure reasons (401 vs 403), so it returns a discriminated result rather than a bare nullable value.

## Performance

- **Memory:** 256 MB. Higher than the 128 MB floor because `getStats` and the two list endpoints fan out several parallel DynamoDB calls per request (`Promise.all` of up to ~50 enrichment queries on a full page) — more concurrent SDK connections/buffers than the single-item CRUD calls `wiedoethet-groups`/`wiedoethet-auth` make. Tune down after real invocation metrics exist if this proves excessive.
- **Timeout:** 10 seconds. `GET /admin/stats` is the worst case (6 parallel top-level queries, 2 of which — `recentUsers`/`recentGroups` — trigger their own enrichment fan-out of up to 5 more queries each); still comfortably parallel rather than sequential, but leave real margin since this function is new and unmeasured.
- **Expected latency:** list/detail endpoints ~150–400 ms at `limit ≤ 20` (dominated by the enrichment fan-out, not the initial GSI3 query); `/admin/stats` ~200–500 ms. These are estimates, not measured — no staging environment exists to benchmark against (see Deployment Reality Override). Revisit once real CloudWatch data exists.
- **Known fan-out cost, why `limit` is capped at 50:** every row in a `/admin/users` or `/admin/groups` page costs at least one extra `Query` (user → `groupCount`; group → `initiatorName` `getItem` + `taskCount`/`memberCount` queries). At `limit=50` that's up to ~150 extra requests fanned out via `Promise.all` for a single group-list page. This is the same enrichment shape `wiedoethet-groups`' `enrichGroup()` already uses per-item, just now applied across a page instead of one initiator's own group list (which is naturally small). If this becomes a real bottleneck at scale, the fix is precomputing `groupCount`/`taskCount`/`memberCount` as denormalized attributes updated on write, not something to solve in this spec.
- **Cold starts:** no VPC (matches every other function in this repo — VPC only adds cold-start latency this app has no reason to pay for). No connection pooling concerns — `DynamoDBDocumentClient` is instantiated at module scope (outside `handler`), same as `lambda/shared/db.js` already does for every function that imports it.

## Monitoring

- **Structured JSON logs** (`console.log`/`console.error` with a JSON-stringified object, not free-text) for each request: `{ level, route, adminUserId, durationMs, resultCount }` on success, and the existing `console.error(err)` inside `serverError()` on failure (already shared via `lambda/shared/http.js` — no change needed there).
- **CloudWatch Logs group:** `/aws/lambda/wiedoethet-admin` (auto-created on first invocation, standard Lambda behavior — no manual setup beyond the function existing).
- **Suggested CloudWatch Logs Insights query** (for the deployment guide / manual verification, not an alarm): filter on `role !== 'admin'` 403s to spot repeated unauthorized access attempts against `/admin/*` — a signal worth watching manually in v1 given there's no staging/alerting infrastructure yet.
- **No CloudWatch Alarms in v1** — this repo has no existing alarms on any of its four current functions (confirmed by reading `wiedoethet-groups`/`wiedoethet-auth` and finding no alarm-related IaC, consistent with "no IaC at all"). Adding alarms for `wiedoethet-admin` alone, ahead of the rest of the stack, is out of scope — flag as future work if/when this repo gets real monitoring infrastructure.

## Acceptance Criteria

1. Any `/admin/*` request with no `Authorization` header, or an invalid/expired JWT, returns `401`.
2. Any `/admin/*` request with a valid JWT for a `role: 'user'` account returns `403`.
3. A valid JWT for a `role: 'admin'` account succeeds (`200`) on all five endpoints given valid path params.
4. `GET /admin/stats` returns `totalUsers`, `totalGroups`, `newUsersLast7d`, `newGroupsLast7d`, `recentUsers` (≤ 5), `recentGroups` (≤ 5), `generatedAt` — matching `AdminStats` in `product/data-model.md` — and does not include `totalTasks`/`totalClaims` (explicitly out of v1 scope).
5. `GET /admin/users` returns items newest-first by `createdAt`, honors `limit` (default 20, rejects values outside 1–50 with `400`), and `nextCursor` round-trips correctly (passing it back as `cursor` returns the next page with no duplicated or skipped items).
6. `GET /admin/users?q=<term>` returns only users whose `email` or `name` contains `<term>` (case-sensitive substring match — known limitation, see below), and correctly returns a full page of `limit` matches (not fewer) when at least `limit` matches exist further in the index than the first internal `Limit`-bounded `Query` reached.
7. `GET /admin/users/{userId}` returns `404` for a non-existent ID, and for a valid ID returns `AdminUserDetail` including its `groups[]` array.
8. `GET /admin/groups`, `GET /admin/groups?q=`, and `GET /admin/groups/{groupId}` mirror criteria 5–7 for groups, with `AdminGroupSummary`/`AdminGroupDetail` enrichment (`initiatorName`, `initiatorEmail`, `taskCount`, `memberCount` / `tasks[]` with per-task `claimCount`).
9. No response from any of the five endpoints contains `PK`, `SK`, `GSI1PK`, `GSI1SK`, `GSI2PK`, `GSI2SK`, `GSI3PK`, or `GSI3SK`.
10. No response from `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /groups`, `GET /groups`, `GET /groups/{id}`, or `GET /groups/share/{token}` contains `GSI3PK`/`GSI3SK` after the `stripKeys()`/`safeUser()` updates (regression check on the two existing functions this feature touches).
11. A user created via `POST /auth/register` and a group created via `POST /groups` are each visible in `GET /admin/users` / `GET /admin/groups` immediately after creation (proves `GSI3PK`/`GSI3SK` are being written correctly on both write paths).
12. No code path in `wiedoethet-admin/index.js`, or in the touched portions of `wiedoethet-auth/index.js`/`wiedoethet-groups/index.js`, issues a DynamoDB `Scan`.
13. `lambda/iam-policy-dynamodb.json`'s `WdhDynamoDBIndexAccess` statement includes the GSI3 index ARN for both `wdh-main` and `wdh-dev`.
14. `openapi.yaml` contains all five `/admin/*` paths, each with an `x-amazon-apigateway-integration` block pointing at `arn:aws:lambda:eu-west-2:344050431068:function:wiedoethet-admin`, matching the existing per-path format used by `/groups`.
15. **Deployment prerequisite, not a code acceptance criterion — confirm before shipping:** if `wdh-main` holds real production data, existing User/Group items predate GSI3 and are absent from GSI3 until a one-time backfill populates `GSI3PK`/`GSI3SK` on them. This must be confirmed with the user before VALIDATE; the backfill script itself is out of scope for this feature (per `vision.md`).

## Known Limitations (carried forward from `vision.md`, restated here for implementers who start at SPEC)

- **Search is substring, not full-text**, and **case-sensitive**. `email` values are always lowercase at write time (`register()` lowercases them), so email search works reliably only if the caller lowercases `q` first; `name` is stored as originally entered, so name search can miss differently-cased matches. Not solved in v1 — documented, not silently broken.
- **`lastActivityAt` is best-effort.** It is `max(user.createdAt, most recent initiated group's createdAt)` — it does **not** account for task-claiming activity, since claims aren't indexed by user (would require a new access pattern / GSI, out of scope for v1).
- **`totalTasks`/`totalClaims` are absent from `/admin/stats`** — no GSI3 partition exists for those entity types; adding them would require either a new index or a table `Scan`, both out of scope for v1.
- **GSI3 backfill for pre-existing data is not built in this run** — see Acceptance Criterion 15.
