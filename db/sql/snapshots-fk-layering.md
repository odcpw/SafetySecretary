# Snapshot FK Layering

`ssfw-kxh` creates `approval_snapshot` as a tenant-scoped storage contract only.
`ssfw-f10` does the same for `generated_artifact`. Both tables deliberately lay
down the workflow discriminator and nullable workflow case ID columns without
enforcing workflow case-table foreign keys or the final `num_nonnulls(...) = 1`
check. That prevents these foundation migrations from referencing workflow
tables that do not exist yet.

## Current Contract

- `approval_snapshot` and `generated_artifact` live in each `tenant_<id>`
  schema, not in `shared`.
- `approved_by` references `shared.users(id)`.
- `generated_artifact.snapshot_id` references `approval_snapshot(id)`.
- `generated_artifact.generated_by` references `shared.users(id)`.
- In both tables, `hira_case_id`, `jha_case_id`, and `ii_case_id` are nullable
  UUID columns with no `REFERENCES` clauses in the storage-contract beads.
- The final "exactly one workflow case id" CHECK is not added in these beads.
- `workflow_data`, `artifact_refs`, and `attachment_refs` are JSONB columns.
  `artifact_refs` and `attachment_refs` stay separate so generated-artifact
  retention and attachment/photo retention can be reasoned about independently.
- `version_label` is constrained to labels such as `v01`, `v02`, and `v10`.
- `generated_artifact.is_snapshot_linked` defaults to `false`; retention and
  append-only business rules are enforced by later nj5 beads.
- The intended artifact version uniqueness is:
  `UNIQUE (workflow_type, COALESCE(hira_case_id, jha_case_id, ii_case_id), output_type, version_seq)`.
  It is deferred with the workflow FKs because two of the three case ID columns
  are intentionally NULL until the final workflow-specific CHECK is installed.
- `00100_approval_snapshot.sql` applies the contract idempotently to existing
  tenant schemas. `00110_generated_artifact.sql` extends the same provisioning
  hook so post-`00200` tenant provisioning applies both storage contracts.
  `ssfw-8hk` should consolidate that hook when it adds the first workflow FK.

## Follow-On Beads

1. `ssfw-8hk` adds the Incident Investigation FKs after `ssfw-t54` has created
   `incident_case`. It should consolidate the tenant-provisioning hook, bind both
   `approval_snapshot.ii_case_id` and `generated_artifact.ii_case_id`, then add
   an interim CHECK that permits II-backed snapshots/artifacts while HIRA and JHA
   case tables are still absent.
2. A future HIRA snapshot/artifact-FK bead adds the `risk_assessment_case` FKs
   and broadens the interim CHECK to include HIRA once the HIRA case table
   exists.
3. A future JHA snapshot/artifact-FK bead adds the `jha_case` FKs and broadens
   the interim CHECK to include JHA once the JHA case table exists.
4. A final CHECK-tightening bead replaces interim workflow-specific checks with
   the ADR-0002 invariant
   `num_nonnulls(hira_case_id, jha_case_id, ii_case_id) = 1` on both storage
   tables after all three workflow case tables and FKs exist. That bead also
   installs the artifact uniqueness constraint documented above.

Until those beads land, application code must not treat the three workflow case
ID columns as DB-enforced references. These beads only establish the serializer
storage shapes plus the FKs to already-existing `shared.users` and
`approval_snapshot`.
