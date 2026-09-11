# Spec — Infrastructure as Code (CDK Adoption via `cdk import`)

**Status:** Draft — CDK scaffold and OpenAPI export written; no `cdk import`/`cdk deploy` run against live AWS yet.
**Last Updated:** 2026-09-11

---

## Deployment Reality Override — read this before DESIGN/IMPLEMENT

This spec is unusual: the "feature" is the deployment process itself, not
application behavior. Generic pipeline-stage assumptions map onto this repo's
reality as follows:

| Generic assumption | Reality in this repo (this work) |
|---|---|
| IaC already exists to extend | None existed before this work — this spec + `infra/` **is** the first IaC in the repo |
| `NodejsFunction` bundles the handler | Deliberately NOT used — plain `lambda.Function` + `Code.fromAsset('lambda/dist/<fn>')`, reading the same pre-bundled esbuild output (`target=node24, format=cjs, external @aws-sdk/*`) this repo already produces via `npm run bundle`. See `infra/DESIGN.md` §4.1. |
| CDK creates new resources | CDK constructs describe **existing, already-live** resources for `cdk import` to adopt. Nothing here should ever cause CloudFormation to create a new table, function, or REST API — a replacement in `cdk diff` is a stop-and-investigate signal, not something to deploy through. |
| One IAM policy file per Lambda (per generic pipeline convention) | Not produced in this round — execution roles are referenced read-only (`iam.Role.fromRoleArn(..., { mutable: false })`), not owned by this stack. Reproducing each role's inline policy as CDK-managed IAM is a tracked follow-up (`infra/DESIGN.md` §6.3), independent of the import. |
| `apigateway-model.json` per Lambda | Not applicable — the REST API is imported whole via an exported OpenAPI 3.0 body (`infra/openapi/wiedoethet-api.oas30.json`), not modeled resource-by-resource. |
| Test JSON / IAM policy / API Gateway test files per handler | Not produced in this round — no handler code changes. This work only wraps existing, unmodified Lambda functions in CDK constructs. |
| VISION stage produces `vision.md` | Skipped deliberately — this is infra/ops work, not a user-facing feature; `vision.md` in this repo is feature-specific (currently "Vision — Admin Section") and out of scope to touch. `product/product-roadmap.md` Milestone 1.10 serves the equivalent purpose instead. |

---

## Function Purpose

Bring wieDoetHet's existing, hand-deployed AWS resources — the `wdh-main`/
`wdh-dev` DynamoDB tables, the 5 documented Lambda functions and their
`development`/`production` aliases, and the wieDoetHet API Gateway REST API —
under CloudFormation management via AWS CDK's `cdk import`, without
recreating, duplicating, or replacing any of them.

**Why:** a GSI3 fix shipped to `wiedoethet-auth`/`wiedoethet-groups` reached
`$LATEST`/`development` but never reached the manually-pinned `production`
alias, because deployment was (and remains, until this ships) entirely
manual with no record of what was deployed where. This makes that class of
incident visible (via `cdk diff`) and repeatable-to-prevent (via a single
reviewable deploy path) going forward.

## Scope

**In scope:** `wdh-main`, `wdh-dev` (DynamoDB); `wiedoethet-auth`,
`wiedoethet-groups`, `wiedoethet-tasks`, `wiedoethet-claims`,
`wiedoethet-admin` (Lambda, each with `development`/`production` aliases);
the wieDoetHet REST API (`eicwh88y07`), imported complete and as-is.

**Out of scope (see `infra/DESIGN.md` §2 and §6 for full reasoning):**
`wiedoethet-whatsapp`/`wiedoethet-reminders` Lambda management (no recovered
source); wiring `wdh-dev` for real; CDK-managed IAM policies (roles are
referenced, not owned); enabling PITR; fixing the stale `openapi.yaml`
`servers.url`.

## Handler Name

Not applicable — no Lambda handler code is added, removed, or modified by
this work. The 5 existing handlers (`lambda/wiedoethet-{auth,groups,tasks,
claims,admin}/index.js`) are wrapped in CDK constructs unchanged.

## Runtime

Node.js 24.x (`nodejs24.x`), matching every function's live configuration.
Constructed explicitly in CDK as `new lambda.Runtime('nodejs24.x',
lambda.RuntimeFamily.NODEJS)` rather than assumed via a named constant — see
`infra/DESIGN.md` §4.2.

CDK app itself (`infra/`): TypeScript, `aws-cdk-lib` ^2.180.0, `aws-cdk` CLI
^2.180.0. This is a *deviation from the generic instruction to keep the
runtime language identical to the handlers* — `lambda/` stays plain
JavaScript/ESM (unmodified), while `infra/` is TypeScript, matching the
`AIntern` reference repo's established CDK pattern.

## Event Source

Not applicable at the handler level (unchanged). At the infrastructure
level: the existing API Gateway REST API (`eicwh88y07`, REGIONAL endpoint)
is the event source for all 5 in-scope functions plus the 2 out-of-scope
ones, imported via its exported OpenAPI 3.0 body including
`x-amazon-apigateway-integration` blocks.

## Handler Signature

Not applicable — unchanged from each function's existing implementation.

## CDK Construct Contract

### `infra/lib/wiedoethet-api-stack.ts` — `WieDoetHetApiStack`

**DynamoDB** (`buildTable()` helper, applied to both tables):
- Partition key: `PK` (String), Sort key: `SK` (String)
- GSI1, GSI2, GSI3: `{GSI}PK`/`{GSI}SK` (String/String), `ProjectionType.ALL`
- `BillingMode.PAY_PER_REQUEST`
- `pointInTimeRecovery: false` (matches live state on both tables)
- `removalPolicy: cdk.RemovalPolicy.RETAIN` — hard, non-negotiable

**Lambda** (`FunctionSpec[]`, one entry per in-scope function):
- `functionName`, `description`, `codeDir` (→ `lambda/dist/<codeDir>/`),
  `timeoutSeconds`, `memoryMb`, `roleArn` (existing execution role, ARN),
  `environment` (currently just `JWT_SECRET`, plus `TABLE_NAME: 'wdh-main'`
  for `wiedoethet-admin` only — reproducing live config exactly, including
  its inconsistency with the other 4 functions), `productionVersion`
- Per function: one `lambda.Function`, one `development` alias
  (`fn.latestVersion`), one `production` alias (`lambda.Version.
  fromVersionArn(..., ':${productionVersion}')`) — see `infra/DESIGN.md`
  §4.3 for why these are asymmetric by design, not an oversight
- Execution role attached via `iam.Role.fromRoleArn(scope, id, arn, {
  mutable: false })` — referenced, not CDK-owned

**API Gateway:**
- `apigateway.SpecRestApi` with `apiDefinition: ApiDefinition.fromAsset(
  'infra/openapi/wiedoethet-api.oas30.json')`, `endpointTypes: [REGIONAL]`,
  `deploy: false`, `cloudWatchRole: false`
- Manual `apigateway.Deployment` + `apigateway.Stage` per stage, preserving
  live stage variables:
  - `production`: `{ lambdaAlias: 'production', tableName: 'wdh-main' }`
  - `development`: `{ lambdaAlias: 'development', tableName: 'wdh-dev' }`
- `alias.addPermission()` per function/stage, scoped via
  `api.arnForExecuteApi('*', '/*', stageName)` — expected to land as an
  additive diff post-import (see `infra/DESIGN.md` §4.8), not part of the
  `cdk import` batch itself

**Tags** (stack-wide): `Project: wiedoethet`, `ManagedBy: cdk`,
`Feature: infra-cdk-import`

**Outputs:** `RestApiId`, `MainTableName`, `DevTableName`

## Environment Variables

| Variable | Where used | Notes |
|---|---|---|
| `CDK_DEFAULT_ACCOUNT` | `infra/bin/wiedoethet.ts` | falls back to `344050431068` |
| `CDK_DEFAULT_REGION` | `infra/bin/wiedoethet.ts` | falls back to `eu-west-2` |
| `WDH_JWT_SECRET` | `infra/lib/wiedoethet-api-stack.ts` (`resolveJwtSecret()`) | required at synth/import/deploy time; alternatively `--context jwtSecret=...`; **never hardcoded, logged, or committed** — the current value was incidentally exposed in an earlier session and is treated as compromised (do not read it back out) |

Each Lambda's own runtime environment (`JWT_SECRET`, and `TABLE_NAME` for
`wiedoethet-admin` only) is set per-function inside the stack from the
`FunctionSpec.environment` map — see above.

## IAM Permissions

This stack does **not** create or own any IAM roles or policies. Each
Lambda's existing execution role is referenced read-only:

```
iam.Role.fromRoleArn(this, `${id}Role`, spec.roleArn, { mutable: false })
```

Roles referenced (ARNs captured from live recon, account `344050431068`):
- `wiedoethet-auth-role-rg65et0e`
- `wiedoethet-groups-role-fv1azmgq`
- `wiedoethet-tasks-role-amaa0ejw`
- `wiedoethet-claims-role-1t4oyrbv`
- `wiedoethet-admin-role`

No IAM policy document is produced by this spec. Reproducing each role's
inline policy as a CDK-managed `iam.Policy` is a tracked follow-up
(`infra/DESIGN.md` §6.3) — deliberately independent of this import so that a
policy-authoring mistake can't block or corrupt the resource adoption.

The stack's own deploy-time IAM footprint is whatever the CDK bootstrap
deployment role already grants (CloudFormation execution role in the
existing CDK bootstrap stack) — no new deploy-time IAM is introduced by this
stack's resources themselves, since Lambda execution roles are referenced,
not created.

## DynamoDB Integration

Table names: `wdh-main` (live, in active use by every function), `wdh-dev`
(live, provisioned, functionally unused today — see Known Limitations).
Schema is identical on both: `PK`/`SK` (String/String) primary key, GSI1/
GSI2/GSI3 (each `{GSI}PK`/`{GSI}SK`, String/String, `ProjectionType.ALL`),
`PAY_PER_REQUEST` billing, PITR disabled. No access-pattern changes — this
work does not touch `lambda/shared/db.js` or any query logic.

## Error Handling

Not applicable to application error paths (unchanged). Infrastructure-level
error handling for the *import process itself* lives in
`infra/IMPORT_CHECKLIST.md`:
- `cdk diff` must be reviewed after every import step before any `cdk
  deploy`; a replacement or deletion shown for `wdh-main`, `wdh-dev`, or any
  of the 5 functions is treated as a stop condition, not something to
  deploy through
- `resolveJwtSecret()` throws a clear, actionable error (rather than
  silently defaulting) if neither `WDH_JWT_SECRET` nor `--context
  jwtSecret` is supplied

## Performance

Not applicable — no handler code, memory, or timeout values are changed
from their current live configuration (all 5 functions: 128 MB memory;
timeouts: `wiedoethet-admin` 10s, the other 4 functions 3s each — all values
copied verbatim from live `get-function-configuration` output, not altered).

## Monitoring

No new CloudWatch alarms are introduced by this round. `cloudWatchRole:
false` on the `SpecRestApi` (plus the `@aws-cdk/aws-apigateway:
disableCloudWatchRole` context flag) deliberately prevents this stack from
touching the shared account's `AWS::ApiGateway::Account` CloudWatch role,
since this AWS account is shared with other unrelated projects (itguru,
aintern, myguide, tours) that may already have it configured. Adding
CDK-managed alarms (e.g., on production alias error rate, so a repeat of the
GSI3 incident would page someone rather than go unnoticed) is a reasonable
future increment, not part of this spec.

## Acceptance Criteria

1. `infra/` CDK app exists with `bin/wiedoethet.ts`, `lib/wiedoethet-api-
   stack.ts`, `package.json`, `cdk.json`, `tsconfig.json`, `.gitignore`
2. `cd infra && npm install && npx tsc --noEmit` succeeds with zero errors
3. `npm run synth` (from `infra/`) produces a CloudFormation template
   without error, after `lambda/dist/` has been freshly built
4. The synthesized template's `AWS::DynamoDB::Table` resources for
   `wdh-main`/`wdh-dev` match live `describe-table` schema exactly (PK/SK,
   GSI1/2/3, billing mode)
5. The synthesized template's 5 `AWS::Lambda::Function` resources match
   live `get-function-configuration` output exactly (runtime, timeout,
   memory, role ARN) for each of `wiedoethet-{auth,groups,tasks,claims,
   admin}`
6. Each function has exactly two `AWS::Lambda::Alias` resources
   (`development`, `production`) with `development` tracking `$LATEST` and
   `production` pinned to the version captured at design time
7. `wiedoethet-whatsapp` and `wiedoethet-reminders` are **not** declared
   anywhere in the stack
8. `infra/openapi/wiedoethet-api.oas30.json` exists and is a valid OpenAPI
   3.0 export of the live `production` stage, including integration blocks
9. `JWT_SECRET`'s live value never appears in any file in this repo, any
   CDK output, or any log produced during synth
10. `infra/DESIGN.md` documents the `cdk import` rationale, all deliberate
    construct deviations from generic guidance, and the Phase A/Phase B
    split for API Gateway import risk
11. `infra/IMPORT_CHECKLIST.md` marks every AWS-mutating step
    **[APPROVAL REQUIRED]** and every non-mutating step **[READ-ONLY]**,
    and includes a re-verification step for production alias version pins
    immediately before import
12. `product/product-roadmap.md` reflects this work as Milestone 1.10 and
    cross-references it from the pre-existing Milestone 1.7 Reality check
13. No `cdk import`, `cdk deploy`, or other AWS-mutating command has been
    run as part of satisfying criteria 1–12
14. No change is made to `src/` (the Vue frontend)
15. No existing alias name (`development`/`production`) or API Gateway
    stage name is renamed anywhere in the CDK code or OpenAPI export

## Known Limitations

- **API Gateway import support is unverified.** Whether
  `AWS::ApiGateway::RestApi`/`Deployment`/`Stage` can be adopted via `cdk
  import` at all has not been empirically confirmed — this is a commonly
  cited CloudFormation gap. `infra/DESIGN.md` §4.7 and
  `infra/IMPORT_CHECKLIST.md` Step 1 treat this as a decision point requiring
  the user's input before Phase B proceeds; Phase A (tables + functions/
  aliases) does not depend on this being resolved.
- **`wdh-dev` is imported faithfully broken.** No function's `TABLE_NAME`
  actually selects it; this spec reproduces that state rather than fixing
  it, per explicit decision (`decisions/2026-09-11-cdk-import-scope.md`).
- **`wiedoethet-whatsapp`/`wiedoethet-reminders` remain unmanaged.** Their
  API Gateway routes stay live and wired (imported as part of the REST API
  body) but this stack cannot manage their Lambda resources without
  recovered source code.
- **Lambda resource-policy statements (`AWS::Lambda::Permission`) are not
  imported**, only declared for future desired-state — expect an additive,
  non-breaking diff on first post-import deploy, not a clean no-op.
- **This spec does not cover secret rotation.** `JWT_SECRET`'s current value
  is treated as compromised due to earlier incidental exposure, but rotating
  it is a separate decision (it invalidates every live session) requiring
  its own explicit confirmation, independent of this infra work.
