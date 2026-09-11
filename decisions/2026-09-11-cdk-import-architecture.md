## Decision: Use plain `lambda.Function` + `Code.fromAsset` (pre-bundled esbuild output), not `NodejsFunction`
scope: project

## Context

The generic Lambda-builder guidance this session operates under defaults to
CDK's `NodejsFunction` construct for all Lambda handlers. wieDoetHet already
has a working, tuned bundling pipeline (`lambda/package.json`'s `bundle:*`
scripts: `--platform=node --target=node24 --external:@aws-sdk/*
--format=cjs`, output to `lambda/dist/<fn>/index.js`) that predates this CDK
work and is what's actually live in production today.

## Alternatives considered

1. Use `NodejsFunction`, letting CDK's internal esbuild bundle each
   handler directly from `lambda/wiedoethet-*/index.js` at synth time.
2. (Chosen) Use plain `lambda.Function` + `Code.fromAsset(path to
   lambda/dist/<fn>)`, reading this repo's own pre-bundled esbuild output,
   with a `predeploy` npm hook (`cd ../lambda && npm run build`) ensuring
   it's fresh before every synth/import/deploy.

## Reasoning

`NodejsFunction` runs its own bundling with its own default esbuild
settings — these are configurable, but by default they will not exactly
match `lambda/package.json`'s hand-tuned flags, and a `cdk import` /
diff-sensitive workflow benefits from the deployed artifact being *exactly*
what this repo has already validated as working in production, not a
freshly-reinvoked bundle that happens to usually produce equivalent output.
This also matches the actual pattern already used in the `AIntern` reference
repo this CDK adoption is modeled on.

## Trade-offs accepted

- `infra/`'s `predeploy` hook now depends on `lambda/package.json` having a
  `build` script (added as an alias for the existing `bundle` script) — a
  small coupling between the two package.json files that wouldn't exist
  under `NodejsFunction`.
- If `lambda/package.json`'s bundler flags ever drift out of sync with what
  CDK expects (e.g., someone changes `--format` without updating this
  stack's assumptions about `handler: 'index.handler'`), that drift is
  silent until a deploy fails — same risk profile as the manual deploy
  process this work replaces, but at least now caught by `cdk diff`/`cdk
  deploy` rather than only discovered in production.

## Supersedes

None.

---

## Decision: Reproduce the asymmetric `development`($LATEST)/`production`(pinned-version) alias pattern faithfully, not `addAlias()`/`currentVersion`
scope: project

## Context

wieDoetHet's live alias promotion model has `development` always tracking
`$LATEST`, while `production` is manually pinned to a specific published
version number, promoted independently and asynchronously. This asymmetry
is exactly the mechanism that allowed the triggering GSI3 incident: a fix
reached `$LATEST`/`development` but the `production` alias's pinned version
predated it, and nothing surfaced that gap.

## Alternatives considered

1. Use CDK's `fn.addAlias()` convenience method or `fn.currentVersion` for
   both aliases, which would make `production` auto-track code+config
   changes going forward — arguably "fixing" the exact bug class that
   caused the incident.
2. (Chosen) Reproduce the current live behavior exactly: `development` →
   `fn.latestVersion`; `production` → `lambda.Version.fromVersionArn(...,
   ':${productionVersion}')` pinned to the version captured at design-time
   recon.

## Reasoning

Changing the promotion model is a legitimate improvement to consider, but
it is a **behavior change**, not an import — and it's exactly the kind of
change the user's guardrails say must not happen as a side effect of
adopting existing resources ("must describe the *existing* resources
precisely enough for `cdk import` to adopt them"). If `production` were
switched to auto-track `currentVersion` as part of this same change, the
very next `cdk deploy` would silently promote whatever is in `$LATEST`
straight to production — a much larger, unreviewed behavior change bundled
invisibly into what's supposed to be a faithful infrastructure adoption.
Fixing the promotion model deserves its own explicit decision, deployed and
reviewed on its own.

## Trade-offs accepted

- The imported stack will faithfully preserve the exact deploy-drift risk
  that caused the incident — CDK adoption alone does not fix it, it only
  makes the current state *visible* via `cdk diff` (e.g., you can now ask
  "what does `cdk diff` show if I bump `productionVersion`" instead of
  having no record at all).
- A follow-up decision is needed (tracked in `infra/DESIGN.md` §6.6) on
  whether to move to an explicit promotion step, a CodeDeploy canary, or
  some other mechanism that makes "is production caught up with
  development" a first-class, checkable question.

## Supersedes

None.
