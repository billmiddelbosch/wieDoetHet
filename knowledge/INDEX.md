# Knowledge Index — wieDoetHet

Routes to domain-specific knowledge for this project. Check universal rules
(`~/.claude/agent-memory/lambda-feature-builder/knowledge/`) and client rules
first — none apply here (no client for this project). These files are
project-scoped facts, hypotheses, and rules.

| Domain | File | Covers |
|---|---|---|
| Infrastructure | [`infrastructure/knowledge.md`](infrastructure/knowledge.md) | Deployment process, CDK adoption, the GSI3 incident |
| DynamoDB | [`dynamodb/knowledge.md`](dynamodb/knowledge.md) | `wdh-main`/`wdh-dev` schema, the unused-table bug |
| IAM | [`iam/knowledge.md`](iam/knowledge.md) | Execution role structure, referenced-not-owned pattern |
| API Gateway | [`api-gateway/knowledge.md`](api-gateway/knowledge.md) | REST API structure, orphaned Lambda routes |
| Lambda patterns | [`lambda-patterns/knowledge.md`](lambda-patterns/knowledge.md) | Alias/version pinning asymmetry, bundling |

## Hypotheses tracking (none promoted to rules yet — first pass)

All entries below are `[CONFIRMED x1]` as of 2026-09-11 (first time each
pattern was observed in this project). No project rule has reached the `x3`
threshold yet.
