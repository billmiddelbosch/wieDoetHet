# API Gateway — Knowledge

## Facts

- wieDoetHet's REST API (`eicwh88y07`, REGIONAL endpoint, root resource
  `redvbiezvb`) has no Lambda authorizers configured — all auth is handled
  in-handler (hand-rolled JWT, `lambda/shared/jwt.js`), not at the gateway
  layer.
- Two stages exist: `production` and `development`, each with its own
  stage variables (`lambdaAlias`, `tableName`) that route to the matching
  Lambda alias and (nominally) DynamoDB table per stage — this is the
  mechanism by which a single REST API + single Lambda function set serves
  two logically separate environments.
- The live REST API has routes wired to `wiedoethet-whatsapp` and
  `wiedoethet-reminders` — two Lambda functions with **no source code
  present in this repo**. These routes are real and live, just
  undocumented at the code level.
- `aws apigateway get-export --export-type oas30 --parameters
  extensions='integrations'` is the read-only way to capture a ground-truth
  OpenAPI document including embedded `x-amazon-apigateway-integration`
  blocks — sufficient as a CDK `SpecRestApi` body source, and far less
  error-prone than hand-transcribing ~25 resources / ~50 methods.
- The repo's hand-maintained root `openapi.yaml` has a stale `servers.url`
  pointing at an unrelated REST API (`trca8esu3j`, the shared account's
  "tourAPI") instead of wieDoetHet's own `eicwh88y07` — a pre-existing doc
  bug, out of scope for this work.

## Hypotheses

- `[CONFIRMED x1]` Whether `AWS::ApiGateway::RestApi` (Body-based) and its
  `Deployment`/`Stage` sub-resources support CloudFormation `cdk import` is
  NOT something to assume either way — treat it as an unverified risk
  requiring empirical confirmation (or explicit fallback planning) before
  committing an import batch that includes API Gateway resources. This is a
  commonly-cited CloudFormation gap; don't take "CDK can synth it" as proof
  "CDK can import it."
