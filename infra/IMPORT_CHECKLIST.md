# wieDoetHet — `cdk import` Checklist

Read `infra/DESIGN.md` first — this checklist assumes its reasoning.

**None of the commands below that mutate AWS state have been run yet.**
Every step that touches the live account is marked **[APPROVAL REQUIRED]** and
must not be run without your explicit go-ahead at that point, even if an
earlier step in this same checklist was already approved. Steps marked
**[READ-ONLY]** are safe to run any time — they make no changes.

---

## Step 0 — Prerequisites

- [ ] **[READ-ONLY]** Confirm you're on the right branch:
  ```
  git branch --show-current
  ```
  Expect `infra/cdk-import`.

- [ ] **[READ-ONLY]** Install CDK app dependencies:
  ```
  cd infra
  npm install
  ```

- [ ] **[READ-ONLY]** Confirm the TypeScript stack compiles:
  ```
  npx tsc --noEmit
  ```

- [ ] Set the JWT secret for this session only, from wherever you keep the
  current live value — **do not paste it into chat, a file, or a commit.**
  ```
  export WDH_JWT_SECRET="<current live value>"
  ```
  (PowerShell: `$env:WDH_JWT_SECRET = "<current live value>"`)

- [ ] **[READ-ONLY]** Bundle fresh Lambda code (the stack reads from
  `lambda/dist/`, which is currently stale/incomplete — only
  `wiedoethet-admin` has output, and it's from 2026-08-20):
  ```
  cd lambda && npm run build && cd ../infra
  ```

- [ ] **[READ-ONLY]** Re-verify nothing has moved since design-time recon —
  production alias version pins, table schemas, and API Gateway
  RestApiId/rootResourceId are all hardcoded into the stack from a point-in-time
  snapshot:
  ```
  aws lambda list-aliases --function-name wiedoethet-auth   --query "Aliases[?Name=='production'].FunctionVersion" --output text
  aws lambda list-aliases --function-name wiedoethet-groups --query "Aliases[?Name=='production'].FunctionVersion" --output text
  aws lambda list-aliases --function-name wiedoethet-tasks  --query "Aliases[?Name=='production'].FunctionVersion" --output text
  aws lambda list-aliases --function-name wiedoethet-claims --query "Aliases[?Name=='production'].FunctionVersion" --output text
  aws lambda list-aliases --function-name wiedoethet-admin  --query "Aliases[?Name=='production'].FunctionVersion" --output text
  ```
  Expected (from recon): auth=2, groups=3, tasks=2, claims=2, admin=1. If any
  of these differ, update `productionVersion` in
  `infra/lib/wiedoethet-api-stack.ts` for that function before continuing.

- [ ] **[READ-ONLY]** Re-export the live OpenAPI body if more than a few days
  have passed since capture, in case routes changed:
  ```
  aws apigateway get-export --rest-api-id eicwh88y07 --stage-name production \
    --export-type oas30 --parameters extensions='integrations' \
    infra/openapi/wiedoethet-api.oas30.json
  ```

## Step 1 — Verify API Gateway is actually importable (do this before Phase B)

This is the single biggest open unknown in the whole plan (see DESIGN.md
§4.7). `AWS::ApiGateway::RestApi`/`Deployment`/`Stage` import support needs to
be confirmed before committing to Phase B.

- [ ] **[READ-ONLY]** `cdk synth` the full stack locally (no AWS mutation —
  this only renders the CloudFormation template to `cdk.out/`, it does not
  touch the live account):
  ```
  npm run synth
  ```
  Confirm it produces a template without errors, and inspect
  `cdk.out/WieDoetHetApiStack.template.json` for the `AWS::ApiGateway::RestApi`
  resource — confirm the `Body` matches the exported OpenAPI shape.

- [ ] Check current AWS CDK / CloudFormation documentation (as of your
  `aws-cdk` version) for `AWS::ApiGateway::RestApi` import support. If
  documentation is ambiguous or you want empirical proof, the only reliable
  test is running `cdk import` itself scoped to just that resource — which is
  an **[APPROVAL REQUIRED]** action (see Phase B below), not something to
  probe casually.

- [ ] **Decision point [needs your input]:** based on what Step 1 turns up,
  choose:
  - (a) Proceed with Phase A + Phase B together, or
  - (b) Proceed with Phase A only for now, and temporarily comment out /
    remove the `SpecRestApi`/`Deployment`/`Stage` constructs from
    `infra/lib/wiedoethet-api-stack.ts` until Phase B is revisited.

## Step 2 — Phase A: DynamoDB tables + Lambda functions/aliases **[APPROVAL REQUIRED]**

Do not run until you've explicitly confirmed you want to proceed.

- [ ] **[APPROVAL REQUIRED]** Generate the resource mapping CDK needs for
  import (this itself is read-only — `cdk import` will prompt interactively
  or read a resource-mapping file; check the current `aws-cdk` version's
  exact invocation, e.g. `cdk import --resource-mapping mapping.json`, or run
  it interactively and answer prompts with the live physical IDs):
  - `WdhMainTable` → DynamoDB table `wdh-main`
  - `WdhDevTable` → DynamoDB table `wdh-dev`
  - `WiedoethetAuth` / `WiedoethetGroups` / `WiedoethetTasks` /
    `WiedoethetClaims` / `WiedoethetAdmin` → the matching Lambda function
    names
  - Each `*DevAlias` / `*ProdAlias` → the matching `development`/`production`
    alias on that function

- [ ] **[APPROVAL REQUIRED]** Run the import, scoped to Phase A resources:
  ```
  npm run import
  ```
  (or `cdk import` directly, following whatever resource-mapping flow your
  CDK version uses)

- [ ] **[READ-ONLY]** Immediately after, run `cdk diff` and review every line
  before doing anything else:
  ```
  npx cdk diff
  ```
  Expect: tag additions (Project/ManagedBy/Feature), and — if aliases were
  imported without their `addPermission()` statements pre-existing as
  CDK-recognized resources — new `AWS::Lambda::Permission` additions (see
  DESIGN.md §4.8). **Do not expect, and do not proceed past, any line showing
  a replacement or deletion of `wdh-main`, `wdh-dev`, or any of the 5
  functions.** If you see one, stop and investigate — do not deploy.

- [ ] **[APPROVAL REQUIRED]** Only after a clean review of the diff above,
  deploy to reconcile the additive changes (tags, permissions):
  ```
  npm run deploy
  ```

## Step 3 — Phase B: API Gateway (only if Step 1's decision point chose (a), or once revisited)

- [ ] **[APPROVAL REQUIRED]** Same import flow as Step 2, scoped to:
  - `WieDoetHetApi` → REST API `eicwh88y07`
  - `ProductionDeployment` / `ProductionStage` → the live `production`
    deployment/stage
  - `DevelopmentDeployment` / `DevelopmentStage` → the live `development`
    deployment/stage

- [ ] **[READ-ONLY]** `cdk diff` again, same scrutiny as Step 2 — no
  replacement of the RestApi, and stage variables must show as unchanged
  (`lambdaAlias`/`tableName` on both stages).

- [ ] **[APPROVAL REQUIRED]** `cdk deploy` to reconcile.

## Step 4 — Post-import validation **[READ-ONLY]**

- [ ] Hit both stages' base paths (or an existing safe read-only route, e.g.
  a `GET` that doesn't mutate data) and confirm responses are unchanged:
  ```
  curl -s https://eicwh88y07.execute-api.eu-west-2.amazonaws.com/production/...
  curl -s https://eicwh88y07.execute-api.eu-west-2.amazonaws.com/development/...
  ```
- [ ] Confirm `/admin/*` on production now reflects users/groups created
  since GSI3 shipped — this is the actual bug this whole effort exists to
  make un-repeatable.
- [ ] Confirm CloudWatch Logs for all 5 functions show no new errors
  post-deploy.

## Step 5 — Commit **[APPROVAL REQUIRED for push/PR]**

- [ ] Stage only the files created/edited for this work — **not** the
  pre-existing unrelated uncommitted changes already on this branch
  (`src/lib/axios.js`, `src/main.js`, `src/mocks/data.js`,
  `src/mocks/handlers.js`, `cypress/e2e/customer-group-task-flow.cy.js`):
  ```
  git add infra/ product/specs/infra-cdk-import.spec.md product/product-roadmap.md \
    knowledge/ decisions/ lambda/package.json
  ```
- [ ] Commit, push, and open a PR only after you explicitly say to.
