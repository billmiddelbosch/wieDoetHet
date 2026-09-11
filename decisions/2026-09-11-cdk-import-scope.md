## Decision: Exclude `wiedoethet-whatsapp`/`wiedoethet-reminders` from CDK Lambda management, but import the API Gateway complete and as-is (including their routes)
scope: project

## Context

While designing the CDK import of wieDoetHet's live infrastructure, recon of
the API Gateway REST API (`eicwh88y07`) turned up two Lambda functions —
`wiedoethet-whatsapp` and `wiedoethet-reminders` — that are wired into live
routes but have **no source code anywhere in this repo**. Every other routed
function has a matching `lambda/wiedoethet-*/index.js`.

## Alternatives considered

1. Exclude both functions from CDK *and* strip their routes from the
   imported OpenAPI body, so the CDK-managed API surface only reflects
   functions this repo can build.
2. Pull each function's currently-deployed code via `get-function` (download
   URL) and freeze it as a CDK asset, so the stack fully owns them even
   without recovering original source.
3. (Chosen) Import the API Gateway complete and as-is, routes included, but
   declare neither function as a CDK-managed Lambda resource. No live route
   changes. Flag source recovery as a follow-up.

## Reasoning

Option 1 would change live routing behavior as a side effect of an import
that's supposed to be zero-behavior-change — directly against the standing
guardrail that this stack "must not touch or change existing live API
Gateway routes." Option 2 would let CDK "own" a Lambda's code without this
repo ever having reviewable source for it — worse for maintainability than
just leaving it alone, and risks quietly baking in whatever is live right
now (which could include undocumented bugs) as permanent IaC-managed state.
Option 3 keeps the blast radius of this round to zero for these two
functions: their routes keep working exactly as they do today, and nothing
about them is asserted, frozen, or claimed by this stack. Recovering their
source is real, valuable follow-up work, but it's a separate decision with
its own risk profile (need to confirm the recovered/rewritten source
actually matches live behavior before it becomes the deploy source of
truth).

## Trade-offs accepted

- The OpenAPI body imported into `SpecRestApi` will contain integration
  blocks pointing at these two functions' aliases, but the stack has no
  corresponding `lambda.Function`/`lambda.Alias` construct for them — this
  is intentional, not a gap to "complete" in this round.
- These two functions remain fully hand-managed (manual deploys, no diff
  protection) until source is recovered — the exact deploy-drift risk this
  whole effort exists to close remains open for them specifically.

## Supersedes

None.

---

## Decision: Import `wdh-dev` faithfully as functionally unused, rather than wiring it up during this pass
scope: project

## Context

`wdh-dev` exists live with schema identical to `wdh-main`, but recon
confirmed no documented Lambda function actually routes reads/writes to it —
only `wiedoethet-admin` sets `TABLE_NAME` explicitly (hardcoded to
`wdh-main`), and the other 4 functions fall back to `wdh-main` in shared code
regardless of which alias (`development` or `production`) is invoking them.
The `development` API Gateway stage variable `tableName` is set to `wdh-dev`,
but nothing in the Lambda code actually reads that stage variable.

## Alternatives considered

1. Wire `TABLE_NAME` per-alias during this pass (development functions read
   `wdh-dev`, production functions read `wdh-main`) as part of the CDK
   import, since the stage variable already implies this was the intent.
2. (Chosen) Import faithfully as-is — reproduce the current broken/unused
   state in CDK, change nothing about which table any function reads.

## Reasoning

Wiring `TABLE_NAME` correctly is a **behavior change**, not an import — it
would alter what data `development`-alias invocations actually read/write,
which is exactly the kind of surprise this round is supposed to avoid (the
mandate is "describe existing resources precisely enough for `cdk import` to
adopt them," not "fix bugs found along the way"). It also has real
operational implications (does `wdh-dev` need to be seeded/backfilled to be
usable? is anything currently relying on `development` and `wdh-main`
sharing state?) that deserve their own explicit decision and testing, not a
side effect bundled into infrastructure adoption.

## Trade-offs accepted

- The imported CDK stack will faithfully describe a known-inert table
  alongside a known-good one, which looks odd on its own but accurately
  reflects live reality — better than IaC that quietly "corrects" something
  without a recorded decision to do so.
- Follow-up work is needed to decide `wdh-dev`'s fate (wire it up for real,
  or decommission it) — tracked in `infra/DESIGN.md` §6.2.

## Supersedes

None.
