# UI Patterns Audit (Steps / Hazards / Controls / Actions)

This document catalogs how the current UI lets users add/edit/reorder core entities across views, and highlights inconsistencies to resolve in `SafetySecretary-xg8.2`.

## Primary Views

### Phase: Process Steps (`frontend/src/components/phases/PhaseProcessSteps.tsx`)
- **Add**: "Add step" button appends a new draft row.
- **Edit**: Inline inputs (activity/equipment/substances/notes) update local draft state immediately.
- **Reorder**: Per-row ↑/↓ buttons reorder draft state locally.
- **Persist**: Explicit "Save steps" button persists the entire draft list; reorders/edits are not persisted until save.

### Phase: Hazards (`frontend/src/components/phases/PhaseHazardNarrative.tsx`)
- **Add**: Per-step embedded form inside the step cell ("Add hazard") posts a new hazard for that step.
- **Edit**: Inline inputs/textarea per hazard, **autosave on blur** (label/description/existing controls).
- **Reorder**: Per-hazard ↑/↓ buttons trigger `onReorderHazards(stepId, hazardIds)` (persisted immediately).
- **Move step assignment**: Per-hazard "⇢" move menu assigns hazard to another step (persisted immediately).
- **Delete**: Per-hazard delete uses `window.confirm` then deletes (persisted immediately).

### Phase: Baseline Risk Rating (`frontend/src/components/phases/PhaseRiskRating.tsx`)
- **Rate (baseline)**: Per-hazard severity/likelihood dropdowns update local state; commit occurs when both set.
- **Edit hazard metadata**: Category select updates immediately; existing controls edited inline and saved on blur.
- **Grouping**: Step tabs ("See all" + per step) to filter hazards.

### Phase: Controls + Residual Risk (`frontend/src/components/phases/PhaseControls.tsx`)
- **Existing controls**: Inline edit (textarea) saved on blur.
- **Proposed controls**: Per-hazard add form (description + hierarchy) with explicit add; delete via confirm.
- **Residual risk**: Severity/likelihood changes call save as values change (effectively autosave).
- **Grouping**: Per-step grouping with "Unassigned hazards" virtual step.

### Phase: Actions (`frontend/src/components/phases/PhaseControlsActions.tsx`)
- **Add**: Footer form with hazard select + description (+ optional owner/due date).
- **Edit**: Owner/due date saved on blur; status saved on change; description not editable here.
- **Persist**: Immediate per-field saves (no explicit “save all”).

### Overview: Full Worksheet Table (`frontend/src/components/overview/WorkspaceTableView.tsx`)
- **Steps**: Rendered as read-only headers (no edit/add/reorder from this view).
- **Hazards**:
  - Edit label/description via click-to-edit with explicit Save/Cancel.
  - Category updates immediately.
  - No add/delete/reorder/move-to-step controls here.
- **Ratings**: Baseline/residual dropdown changes auto-save once both values present.
- **Controls**:
  - Existing controls edit via explicit “Edit existing” → Save/Cancel.
  - Proposed controls add inline via input + “+”; delete via “×”.
- **Actions**:
  - Add action inline per hazard (text input + add).
  - Edit action via per-item edit mode with Save/Cancel.

## Key Inconsistencies (Candidates for Harmonization)

### Save semantics vary by view/entity
- **Steps**: draft + explicit save (phase) vs no edit (overview).
- **Hazards**: autosave-on-blur (phase) vs explicit Save/Cancel (overview).
- **Residual risk**: effectively autosave on change (controls phase) vs autosave on change (overview) but via different flows.
- **Actions**: mixed autosave-on-blur (phase) vs explicit Save/Cancel (overview action editor).

### Reorder/move controls are not consistently available
- Hazards can be reordered and moved between steps in `PhaseHazardNarrative`, but not in `WorkspaceTableView`.
- Steps can be reordered in `PhaseProcessSteps`, but reordering is local until save; other entity reorders persist immediately.

### Editing affordances differ
- Some edits happen on blur (hazards, existing controls), others require explicit Save (overview hazard edit, overview controls edit, overview action edit).
- Status/toast messaging patterns differ per phase (different wording/timeouts; some operations are silent).

### Validation and required fields vary
- Hazard add requires both label and description in hazard phase; other views don’t offer add.
- Action add requires hazardId + description; some phase edits trim/normalize, others don’t.

## Suggestions to Unblock a Unified Interaction Model (xg8.2)

1. **Pick a single persistence pattern** per entity type:
   - Either: “edit in place → autosave with clear saved state + undo” or “edit mode → Save/Cancel”.
2. **Standardize reordering**:
   - Decide between drag-and-drop everywhere vs consistent ↑/↓ controls everywhere.
3. **Expose the same capabilities in overview vs phase views** (or explicitly scope overview as read-only for certain entities).
4. **Unify feedback**:
   - Centralized “Saving…”/“Saved” component and consistent error display across phases and overview.

