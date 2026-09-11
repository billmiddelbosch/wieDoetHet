# DynamoDB — Knowledge

## Facts

- Single-table design across two tables: `wdh-main` (live, in active use)
  and `wdh-dev` (live, provisioned, **functionally unused** — see
  hypothesis below). Both confirmed byte-identical in schema via
  `describe-table`: `PK`/`SK` (String/String) primary key, GSI1/GSI2/GSI3
  (each `{GSI}PK`/`{GSI}SK`, String/String, `ProjectionType.ALL`),
  `PAY_PER_REQUEST` billing.
- Point-in-Time Recovery is **disabled** on both tables as of 2026-09-11 —
  not something this round's CDK import changes; flagged as a hardening
  follow-up in `infra/DESIGN.md` §6.4.
- GSI3 was added to support admin listing (`product/specs/admin-api.spec.md`)
  but existing items written before GSI3 existed don't have `GSI3PK`/
  `GSI3SK` populated and won't appear in admin listings without a backfill —
  this is a separate, already-flagged risk (`product/product-roadmap.md`
  Milestone 1.9) distinct from the GSI3 deploy-drift incident that triggered
  Milestone 1.10.

## Hypotheses

- `[CONFIRMED x1]` A table can exist live and be fully provisioned
  (correct schema, correct billing mode) while being **functionally
  orphaned** — no application code path ever selects it. `wdh-dev` is the
  first observed instance in this project: it exists, but every one of the
  5 documented Lambda functions resolves to `wdh-main` regardless of which
  alias/stage is invoking them (only `wiedoethet-admin` even sets
  `TABLE_NAME` explicitly, and it hardcodes `wdh-main`). When auditing
  DynamoDB resources for a `cdk import`, always cross-check "does live
  config actually route traffic to this table" before assuming a
  provisioned table is in active use.
