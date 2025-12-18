## Hazard rows are step-scoped

In SafetySecretary, a hazard record represents one row of the HIRA table for a specific process step (Teilprozess).

That means:
- A hazard belongs to exactly one `ProcessStep`.
- If the same “hazard family” appears in multiple steps, it is represented by multiple hazard rows (one per step) so ratings, controls, and actions are not shared across steps.

## Data model

- `Hazard.stepId` (required): the owning process step.
- `Hazard.orderIndex` (required): ordering of hazards within a step for drag/reorder.
- Legacy `HazardStep` join table is removed.

## Migration rules (multi-step hazards)

When upgrading from the legacy `HazardStep` join model, the migration splits hazards linked to multiple steps into one hazard row per step:

- The original hazard row is assigned to its first linked step (lowest `HazardStep.orderIndex`).
- For each additional linked step, a new hazard row is created with copied fields:
  - `label`, `description`, `categoryCode`, `existingControls`
- Related records are duplicated onto each new hazard row:
  - `HazardAssessment` rows (baseline/residual)
  - `HazardControl` rows (proposed controls)
  - `CorrectiveAction` rows linked to the original hazard
  - `Attachment` rows linked to the original hazard (only those with `Attachment.stepId = NULL` or matching the target step)
- If a case has hazards but no steps, a placeholder step is created so all hazards can be assigned.

Implementation reference: `prisma/migrations/20251218220000_hazards_belong_to_one_step/migration.sql`.

