# Infrastructure — Knowledge

## Facts

- Before 2026-09-11, wieDoetHet had **no IaC of any kind** — deployment was
  esbuild bundle → zip → manual Lambda console upload, and `openapi.yaml`
  (repo root) was manually re-imported into API Gateway by hand. No
  CloudFormation/SAM/CDK template existed anywhere in the repo.
- This account (`344050431068`, `eu-west-2`) is **shared across several
  unrelated projects** — itguru, aintern, myguide, tours all have their own
  REST APIs and resources here. Any account-level resource (e.g. the API
  Gateway CloudWatch role, `AWS::ApiGateway::Account`) must be treated as
  potentially already owned by another project's tooling — do not let a
  wieDoetHet CDK stack manage it. Applied via `cloudWatchRole: false` +
  `@aws-cdk/aws-apigateway:disableCloudWatchRole: true`.
- The manual-deployment gap directly caused a production incident: a GSI3
  fix reached `$LATEST`/`development` on two functions but never reached the
  manually-pinned `production` alias, because there was no record anywhere
  of what version was actually live in production. See
  `product/product-roadmap.md` Milestone 1.10 and
  `product/specs/infra-cdk-import.spec.md`.
- `lambda/dist/` (esbuild output) is not committed and was found stale/
  incomplete when this work started — only `wiedoethet-admin` had output,
  from over 3 weeks prior. Any CDK synth/import/deploy that reads
  `Code.fromAsset('lambda/dist/...')` must run `npm run build` (added to
  `lambda/package.json` as an alias for `npm run bundle`) immediately first.

## Hypotheses

- `[CONFIRMED x1]` Projects with fully-manual Lambda deployment (no IaC) are
  prone to "deploy target drift" — code reaching one alias/environment but
  silently not another, with no diff mechanism to catch it. Bringing
  existing resources under CDK via `cdk import` (rather than a rewrite) is a
  low-risk way to retrofit a diffable deploy path onto a live system.
