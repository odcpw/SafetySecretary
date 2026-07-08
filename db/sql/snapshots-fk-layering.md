# Snapshot FK Layering

`00100_approval_snapshot.sql` creates `approval_snapshot` as a tenant-scoped
storage contract only. `00110_generated_artifact.sql` does the same for
`generated_artifact`. Both tables deliberately lay down the workflow
discriminator and nullable workflow case ID columns without enforcing all
workflow case-table foreign keys or the final `num_nonnulls(...) = 1` check.
That prevents these foundation migrations from referencing workflow tables
that do not exist yet.

## Current Contract

- `approval_snapshot` and `generated_artifact` live in each `tenant_<id>`
  schema, not in `shared`.
- `approved_by` references `shared.users(id)`.
- `generated_artifact.snapshot_id` references `approval_snapshot(id)`.
- `generated_artifact.generated_by` references `shared.users(id)`.
- `00220_snapshot_artifact_ii_fks.sql` binds `approval_snapshot.ii_case_id`
  and `generated_artifact.ii_case_id` to `incident_case(id)` and installs an
  interim CHECK that permits II-backed snapshots/artifacts while HIRA and JHA
  case tables are still absent.
- `hira_case_id` and `jha_case_id` remain nullable UUID columns with no
  `REFERENCES` clauses until their case tables exist.
- `workflow_data`, `artifact_refs`, and `attachment_refs` are JSONB columns.
  `artifact_refs` and `attachment_refs` stay separate so generated-artifact
  retention and attachment/photo retention can be reasoned about independently.
- `version_label` is constrained to labels such as `v01`, `v02`, and `v10`.
- `generated_artifact.is_snapshot_linked` defaults to `false`.
- The intended artifact version uniqueness is:
  `UNIQUE (workflow_type, COALESCE(hira_case_id, jha_case_id, ii_case_id), output_type, version_seq)`.
  It is deferred with the remaining workflow FKs because two of the three case
  ID columns are intentionally NULL until the final workflow-specific CHECK is
  installed.

## Follow-On Migrations

1. When the HIRA case table lands, a migration adds the HIRA snapshot/artifact
   FKs and broadens the interim CHECK to include HIRA.
2. If JHA is ever built (currently parked — see `docs/VISION.md`), the same
   pattern applies for `jha_case_id`.
3. A final CHECK-tightening migration replaces interim workflow-specific
   checks with the ADR-0002 invariant
   `num_nonnulls(hira_case_id, jha_case_id, ii_case_id) = 1` on both storage
   tables after all workflow case tables and FKs exist, and installs the
   artifact uniqueness constraint documented above.

Until those migrations land, application code must not treat the HIRA/JHA case
ID columns as DB-enforced references. Only `ii_case_id` is enforced today.
