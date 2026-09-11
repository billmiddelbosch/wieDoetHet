# wieDoetHet — Infrastructure as Code (CDK Adoption) — DESIGN

**Status:** Draft, pending user review — no AWS command has been run against the live account as part of this design.
**Branch:** `infra/cdk-import`
**Last Updated:** 2026-09-11

## 1. Why this exists

A production incident exposed that `wieDoetHet` has never had a reliable deployment
process: a GSI3-related fix was committed to `lambda/wiedoethet-auth` and
`lambda/wiedoethet-groups` but was only ever pushed to each function's `$LATEST`
version (and therefore the `development` alias). The `production` alias stayed
pinned to an older published version. Every user and group created via the
production API since GSI3 was introduced was invisible to `/admin/*`, because
admin reads through GSI3 and production was silently running code that predates
it.

The root cause is process, not code: deployment has been fully manual
(`aws lambda update-function-code`, run by hand, with no record of *what* was
deployed *where*), and there is no machine-readable description of the live
infrastructure to diff against. This work brings the existing, already-live
resources under CDK/CloudFormation management via `cdk import`, so that future
deploys go through a single reviewable path and drift becomes visible instead of
silent.

## 2. Scope

**In scope for this round:**
- `wdh-main` and `wdh-dev` DynamoDB tables (imported as-is)
- `wiedoethet-auth`, `wiedoethet-groups`, `wiedoethet-tasks`, `wiedoethet-claims`,
  `wiedoethet-admin` Lambda functions, each with their `development` and
  `production` aliases
- The wieDoetHet API Gateway REST API (`eicwh88y07`), imported complete and as-is
  via its exported OpenAPI body

**Explicitly out of scope, with a flagged follow-up:**
- `wiedoethet-whatsapp` and `wiedoethet-reminders` Lambda functions — both are
  wired into the live API Gateway but have **no source code in this repo**.
  Their routes stay in the imported API body unchanged; this stack does not
  declare, manage, or touch either function. **Follow-up:** recover or
  reconstruct their source before they can be brought under CDK management.
- Properly wiring `wdh-dev` — it exists live but no function's `TABLE_NAME`
  actually points at it; every function (bar `wiedoethet-admin`, which hardcodes
  `wdh-main`) resolves to `wdh-main` by default in `lambda/shared/db.js`. This is
  reproduced faithfully, not fixed. **Follow-up:** decide whether `wdh-dev`
  should be wired to the `development` alias/stage for real, or decommissioned.
- Reproducing the Lambda execution roles' inline policies as CDK-managed IAM —
  see §4.
- Enabling Point-in-Time Recovery on either table (currently OFF on both live) —
  a hardening item, not touched in this pass.
- Fixing the stale `servers.url` in the hand-maintained root `openapi.yaml`
  (currently points at an unrelated API in this shared account) — pre-existing
  doc bug, unrelated to this work.

See `decisions/2026-09-11-cdk-import-scope.md` for the reasoning behind both
scope exclusions above.

## 3. Why `cdk import`, not fresh resources

CDK constructs in `infra/lib/wiedoethet-api-stack.ts` are written to describe
the tables, functions, aliases, and API Gateway **exactly as they exist live
today** — same names, same ARNs (where referenced), same schemas, same stage
variables. `cdk import` maps each construct onto its existing physical
resource without deleting or recreating anything. Nothing in this stack should
ever cause CloudFormation to create a brand-new table, function, or REST API —
if a `cdk diff` ever shows a replacement for any of these four resource types,
stop and investigate before proceeding; a replacement means the construct
doesn't match live state closely enough.

## 4. Key construct decisions

### 4.1 Plain `lambda.Function` + `Code.fromAsset`, not `NodejsFunction`

The generic Lambda-builder guidance defaults to CDK's `NodejsFunction`, which
runs its own internal esbuild bundling with its own default settings. This repo
already has a tuned, working bundling pipeline
(`lambda/package.json` → `bundle:*` scripts: `--platform=node --target=node24
--external:@aws-sdk/* --format=cjs`, output to `lambda/dist/<fn>/index.js`).
Using `NodejsFunction` would introduce a second, different bundling path for
code that is already live and working, risking silent divergence from the
settings that were deliberately chosen. Instead:
- `lambda/package.json` gained a `build` script (`npm run bundle`) so
  `infra/package.json`'s `predeploy` hook can invoke it uniformly.
- The stack's `lambda.Function` constructs point `code:
  lambda.Code.fromAsset(...)` directly at `lambda/dist/<fn>/`.
- **Prerequisite:** `lambda/dist/` must be freshly built before any
  `synth`/`import`/`deploy`. At last check it only contained stale
  `wiedoethet-admin` output (Aug 20) — the other four functions had no local
  dist output at all. `npm run build` (from `infra/`, via `predeploy`) handles
  this automatically, but it's called out explicitly in
  `IMPORT_CHECKLIST.md` since a stale/missing dist directory would make
  `cdk import` adopt the *wrong code* under the right function name.

### 4.2 Runtime constructed explicitly, not via a named constant

`new lambda.Runtime('nodejs24.x', lambda.RuntimeFamily.NODEJS)` rather than
`lambda.Runtime.NODEJS_24_X`. Node 24 is new enough that whether the installed
`aws-cdk-lib` version has added that named constant is uncertain. This
construction works regardless of version; swap to the named constant later
once confirmed available.

### 4.3 Asymmetric alias construction — this is the crux of the incident

- `development` alias → `fn.latestVersion` (CDK's `IVersion` sentinel for
  `$LATEST`). This matches live behavior: development always tracks the
  newest deployed code.
- `production` alias → `lambda.Version.fromVersionArn(scope, id,
  '${fn.functionArn}:${productionVersion}')`, pinned to a specific published
  version number captured from live state at recon time.

This is **not** `fn.currentVersion` (which auto-publishes and tracks
code+config changes) and **not** the `addAlias()` convenience method (which
defaults both aliases to the same version). Production is, today, manually
promoted and independent of `$LATEST` — which is exactly the mechanism that
let the GSI3 fix ship to `development` without ever reaching `production`. The
CDK code reproduces this faithfully rather than "fixing" it silently; whether
to change the promotion model (e.g., move to `currentVersion`-tracked
production with explicit promotion via a deploy pipeline) is a legitimate
follow-up, but it's a behavior change and needs its own decision, not a
side-effect of an import.

**Before running `cdk import`,** re-verify each function's live production
version number hasn't moved since recon:
```
aws lambda list-aliases --function-name <name> \
  --query "Aliases[?Name=='production'].FunctionVersion" --output text
```

### 4.4 IAM roles referenced, not owned

Each function's execution role is attached via
`iam.Role.fromRoleArn(scope, id, arn, { mutable: false })`, not created by
this stack. A CDK-created `iam.Role` could never produce the exact live Role
ARN that `cdk import` needs to adopt the Function resource — `cdk import`
matches by physical properties, and the role ARN is one of them. Reproducing
each role's inline policy as CDK-managed `iam.Policy`/`iam.PolicyStatement`
resources is deliberately deferred — it's a real improvement (this repo has no
IaC record of what these roles actually grant today) but is independent of
the import and carries its own risk of drift between the CDK-declared policy
and the live one. Tracked as a follow-up, not blocking this round.

### 4.5 DynamoDB: `RemovalPolicy.RETAIN` is non-negotiable

Both `wdh-main` and `wdh-dev` are declared with `removalPolicy:
cdk.RemovalPolicy.RETAIN`. This is a hard safeguard: no `cdk destroy`, no
stack-replacement update, and no accidental resource removal from this stack
can ever delete either live table. Schema (PK/SK, GSI1/GSI2/GSI3, all
String/String, `ProjectionType.ALL`, `PAY_PER_REQUEST` billing) is copied
verbatim from `aws dynamodb describe-table` output on both tables, confirmed
byte-identical between them. PITR is declared `false` on both, matching live
state — enabling it is a follow-up, not a silent addition.

### 4.6 API Gateway: `SpecRestApi` fed by a live OpenAPI export

Rather than hand-transcribing ~25 resources and ~50 methods (including the
`wiedoethet-whatsapp`/`wiedoethet-reminders` routes that must stay wired but
aren't managed as Lambdas here), the REST API body comes from a read-only
export of the live **production** stage:
```
aws apigateway get-export --rest-api-id eicwh88y07 --stage-name production \
  --export-type oas30 --parameters extensions='integrations' \
  wiedoethet-api.oas30.json
```
This file (already captured, at `infra/openapi/wiedoethet-api.oas30.json`) is
ground truth — it includes the embedded `x-amazon-apigateway-integration`
blocks CloudFormation needs, not just the public-facing contract. The
`development` stage export was confirmed structurally identical at capture
time, so a single body serves both stages.

`Deployment` and `Stage` are constructed manually (`deploy: false` on the
`SpecRestApi`) rather than letting CDK auto-deploy, specifically to preserve
the exact live stage variables per stage:
- `production`: `lambdaAlias: production`, `tableName: wdh-main`
- `development`: `lambdaAlias: development`, `tableName: wdh-dev`

`cloudWatchRole: false` (plus the `@aws-cdk/aws-apigateway:disableCloudWatchRole:
true` context flag in `cdk.json`) is deliberate: this AWS account is **shared
across several unrelated projects** (itguru, aintern, myguide, tours all have
their own REST APIs here). CDK's default behavior of managing an
account-level `AWS::ApiGateway::Account` CloudWatch role could conflict with
whatever one of those other projects has already configured. This stack must
never touch that account-level resource.

### 4.7 API Gateway import — the biggest open risk, deliberately unresolved

Whether `AWS::ApiGateway::RestApi` (Body-based) and its `Deployment`/`Stage`
sub-resources actually support CloudFormation resource **import** is not
something I've verified empirically, and I'm not going to guess. This is a
commonly-cited gap in CloudFormation's import support. Two ways this can go:

- **Supported:** the whole stack (tables + functions/aliases + API Gateway)
  imports in one pass.
- **Not supported (or only partially):** import the DynamoDB tables and
  Lambda functions/aliases (**Phase A** — high confidence, standard
  importable resource types), and leave the REST API **described but not
  CloudFormation-managed** for now (**Phase B**) — i.e., remove the
  `SpecRestApi`/`Deployment`/`Stage` constructs from the import batch (or from
  the stack entirely, temporarily) until either CloudFormation's import
  support is confirmed, or an alternative (e.g. a custom resource, or simply
  leaving API Gateway hand-managed for another cycle) is chosen deliberately.

`IMPORT_CHECKLIST.md` treats the RestApi import step as **Step 1: verify
before you commit to it**, precisely because I'm barred from running any form
of `cdk import` — including an aborted test run — without your prior explicit
approval, so this check has to happen with you, not for you.

### 4.8 Lambda invoke permissions — expect an additive diff

`AWS::Lambda::Permission` (the resource-policy statements letting API Gateway
invoke each alias) is **not** part of the `cdk import` batch — these
statements aren't independently named/addressable the way the import command
needs. The stack still declares `alias.addPermission(...)` for each
alias/stage combination, for completeness of desired state. Expect these to
appear as **new, additive** statements on the first `cdk deploy` after import
— Lambda resource policies allow multiple overlapping statements, so this
should not replace or break the equivalent hand-created permissions that
already exist live under different `StatementId`s. Not a breaking change, but
worth expecting rather than being surprised by in the post-import diff.

### 4.9 Tagging

`Project: wiedoethet`, `ManagedBy: cdk`, `Feature: infra-cdk-import` applied
stack-wide via `cdk.Tags.of(this).add(...)`. Expect this to show up as a
low-risk, metadata-only diff on the first post-import deploy (tags are not
typically part of `cdk import`'s resource-matching).

### 4.10 JWT_SECRET handling

The current `JWT_SECRET` value was incidentally exposed in an earlier
session's unscoped tool output and must be treated as compromised. It is
**never** read back out, logged, echoed, or written into any file in this
repo. `resolveJwtSecret()` in the stack pulls it from a CDK context value
(`--context jwtSecret=...`) or the `WDH_JWT_SECRET` environment variable at
synth/import/deploy time only, and throws a clear error if neither is set —
it does not fall back to a hardcoded or default value. Rotating the secret
(which invalidates every live session) is a separate decision from adopting
the current value into CDK, and needs its own explicit confirmation before
being done.

## 5. Phasing

| Phase | Resources | Confidence |
|---|---|---|
| A | `wdh-main`, `wdh-dev` tables; 5 Lambda functions + `development`/`production` aliases | High — both resource types are standard, well-supported `cdk import` targets |
| B | API Gateway `SpecRestApi` + `Deployment` + `Stage` | Unverified — must confirm CloudFormation import support empirically before committing; fallback is to describe-but-not-manage for another cycle |

## 6. Follow-ups (tracked, not part of this round)

1. Recover/reconstruct source for `wiedoethet-whatsapp` and
   `wiedoethet-reminders` so they can be brought under CDK management.
2. Decide the fate of `wdh-dev` — wire it up for real (per-alias `TABLE_NAME`)
   or decommission it.
3. Bring the Lambda execution roles' inline policies under CDK management
   (currently referenced read-only via `fromRoleArn`).
4. Enable Point-in-Time Recovery on `wdh-main` (and `wdh-dev`, if kept).
5. Fix the stale `servers.url` in the root `openapi.yaml`.
6. Decide whether `production`'s manual-pin alias model should change to an
   explicit promotion pipeline (e.g. CodeDeploy canary, or a scripted
   "promote $LATEST to production" step) now that it's CDK-visible.
