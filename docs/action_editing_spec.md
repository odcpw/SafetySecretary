# Action Editing Spec (Canonical Behavior)

Purpose: define a single, canonical action editing model to apply across all views.

## Canonical View
- **Action Plan phase** (`frontend/src/components/phases/PhaseControlsActions.tsx`) is the source of truth.
- Other views (Workspace table, Overview, Case table) should mirror its capabilities and rules.

## Data Model (per Action)
- `description` (required)
- `owner` (optional string)
- `dueDate` (optional date)
- `status` (optional enum; default "Open" or equivalent)
- `hazardId` (required; actions are always scoped to a hazard)
- `orderIndex` (for ordering within a hazard)

## Editing Rules
- **Inline edit** for description, owner, due date, and status.
- **Autosave on blur** for text inputs; **save on change** for select dropdowns.
- **Validation**:
  - Description must be non-empty.
  - Owner can be empty (saved as null).
  - Due date must be valid `YYYY-MM-DD` or null.

## Add / Delete / Reorder
- **Add**: inline "Add action" row scoped to a hazard; description required.
- **Delete**: confirm + undo toast; remove from hazard list.
- **Reorder**: per-hazard ordering only (no cross-hazard reorder). Persist immediately.

## Status Feedback
- Show row-level `Saving...`, `Saved`, `Error` states.
- On failure, keep the local edit and offer a retry affordance.

## UX Consistency Checklist
- Description is editable everywhere actions are shown.
- Owner, due date, and status use the same controls in every view.
- Action lists show "No actions yet" with a clear CTA to add.
- Action counts and ordering match across views after refresh.

## Dependencies
- Drives: `SafetySecretary-edg.2`, `SafetySecretary-edg.3`, `SafetySecretary-edg.4`.
- Aligns with `docs/persistence_policy.md` and `docs/ui_interaction_model.md`.
