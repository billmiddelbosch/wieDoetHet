# IAM — Knowledge

## Facts

- Each of the 5 documented Lambda functions has its own dedicated execution
  role (not shared), named inconsistently: 4 are auto-generated
  service-role names (`wiedoethet-{fn}-role-{suffix}`), one
  (`wiedoethet-admin-role`) is a plain hand-named role with no random
  suffix — suggesting it was created through a different path (console
  wizard vs. manual role creation) than the other four.
- No IaC has ever described what these roles actually grant — the only
  source of truth is the live role's attached/inline policies via
  `aws iam get-role-policy` / `list-attached-role-policies`.

## Hypotheses

- `[CONFIRMED x1]` When adopting existing Lambda functions into CDK via
  `cdk import`, a CDK-created `iam.Role` can never match the live Role ARN
  needed for the Function's physical-ID match — so execution roles must be
  referenced read-only (`iam.Role.fromRoleArn(..., { mutable: false })`),
  not created by the importing stack. Reproducing the role's actual policy
  as CDK-managed IAM is a legitimate, separate follow-up (it closes a real
  gap — no IaC record of least-privilege grants exists), but bundling it
  into the same change as the resource import adds unnecessary risk of a
  policy-authoring mistake blocking or corrupting the import itself. Do
  these as two separate changes.
