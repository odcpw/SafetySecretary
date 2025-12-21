# Unified Persistence + Dirty-State Policy (Beta)

Purpose: define how edits are saved, how "dirty" state is shown, and when navigation is blocked or warned. This aligns with `docs/ui_interaction_model.md` and drives the hp8 task set.

## Principles
- Prefer per-entity autosave over page-level "save all".
- Always show **what is saved vs pending vs failed** at a row level.
- Consistency over per-view exceptions.
- Navigation should be safe: warn if changes might be lost, but avoid false alarms.

## State Definitions
- **Saved**: last edit has been acknowledged by the API.
- **Pending**: local edit exists; request in-flight.
- **Failed**: last save attempt failed; user can retry.
- **Dirty** (global): any row is Pending or Failed.

## Entity Persistence Rules (Canonical)

### Process Steps
- **Add/Edit/Reorder/Delete**: autosave on change (prefer patch-by-step).
- **Fallback**: if patching is not available, keep a draft list but show a sticky "Unsaved steps" banner and guard navigation.
- **Status**: row-level status and global dirty indicator.

### Hazards
- **Add/Edit/Move/Reorder/Delete**: immediate save per action.
- **Status**: show per-row status for inline edits; structural actions show toast + undo.

### Baseline + Residual Ratings
- **Edit**: save when both severity and likelihood are set.
- **Clear**: explicit clear action (per policy from `SafetySecretary-qt8.1`).
- **Status**: show per-row saving indicator (no "Saving" when no request is sent).

### Controls (Existing + Proposed)
- **Existing**: autosave on blur; per-row status.
- **Proposed**: create on submit; edits autosave; delete with confirm + undo.

### Actions
- **Add/Edit/Delete**: autosave per field/action with row-level status.
- **Consistency**: action description is always editable in every view that shows actions.

### Workspace Table View
- Mirrors the same autosave model as phase views.
- Any modal/inline editor must surface saving/pending/failed states.

## Navigation Policy
- If **Pending** saves exist: show confirmation modal ("Changes still saving. Wait or leave?").
- If **Failed** saves exist: show confirmation modal ("Some changes failed to save. Leave anyway?").
- If **Saved** only: no warning.
- Prevent switching phases if a required field failed to save and cannot be resolved later (rare; should be avoided).

## Top Bar Save / Refresh
- Remove global "Save" semantics once autosave is consistent.
- Replace with **Refresh** (re-fetch current case data) and a **Save Status** indicator.
- Save Status text: `All changes saved`, `Saving...`, `Changes failed` (with retry).

## UI Checklist
- Add global dirty indicator (header) + row-level status UI.
- Align all edit flows to autosave (remove per-view exceptions).
- Ensure "Save" buttons are only used for explicit draft modes (if any remain).
- Add navigation guard for pending/failed states.
- Add inline retry affordances for failed saves.

## Implementation Notes
- Use a shared save-status hook or context to aggregate row statuses.
- Align error messaging with `SafetySecretary-hp8.4` (unified save/error feedback).
- Document any intentional exceptions in this file before implementing them.
