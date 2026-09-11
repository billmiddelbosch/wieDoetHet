# Lambda Patterns — Knowledge

## Facts

- All 5 documented wieDoetHet functions use the `development`/`production`
  alias pair, but **asymmetrically**: `development` tracks `$LATEST`
  (moves with every deploy), while `production` is a manually-pinned
  specific version number, promoted independently. This is not a CDK
  concept — it's the live, pre-existing promotion model this project
  already used by hand.
- This project's esbuild bundling is deliberately tuned:
  `--platform=node --target=node24 --external:@aws-sdk/* --format=cjs`,
  output to `lambda/dist/<function>/index.js`. `lambda/` is plain
  JavaScript/ESM source; the *build output* is CJS.
- `wiedoethet-admin` differs from the other 4 functions in two ways: it has
  a 10s timeout (vs. 3s for the others) and it explicitly sets
  `TABLE_NAME=wdh-main` in its environment, while the other 4 have no
  `TABLE_NAME` env var and fall back to `wdh-main` in shared code
  (`lambda/shared/db.js`). Both are live-state facts to reproduce
  faithfully in IaC, not inconsistencies to silently "fix" during an
  import.

## Hypotheses

- `[CONFIRMED x1]` When a project's `production` alias is manually pinned
  (not auto-tracking `$LATEST`/`currentVersion`), that promotion gap is
  exactly the mechanism by which a fix can ship to `development` and
  silently never reach `production` — with no error, no alarm, nothing
  visible unless someone specifically diffs alias→version mappings. If a
  project uses this manual-pin pattern, treat "does production actually
  have the fix" as a question that needs an explicit check on every
  release, not an assumption. CDK import should reproduce this pattern
  faithfully (not auto-"fix" it to `currentVersion`-tracking) since
  changing the promotion model is a deliberate, separate decision — but the
  incident itself is a strong argument *for* eventually making that
  decision (e.g., an explicit promotion step or CodeDeploy canary), tracked
  as a follow-up rather than done silently.
- `[CONFIRMED x1]` Preserve an existing project's tuned bundler config
  (target runtime version, format, externals) by reusing its actual build
  output (`Code.fromAsset` pointed at the existing `dist/` convention)
  rather than defaulting to CDK's `NodejsFunction`, which runs its own
  internal esbuild with its own defaults. This avoids introducing a second,
  divergent bundling path for code that's already live and working.
