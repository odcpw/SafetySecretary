# Unified Interaction Model (Keyboard-First)

This is the proposed single interaction model for adding/editing/deleting/reordering **steps, hazards, controls, assessments, and actions**. It is intended to drive `SafetySecretary-xg8.3` and the browser TUI prototype (`SafetySecretary-xg8.4`).

## Goals
- **Consistency**: the same interaction patterns across phases and the overview table.
- **Keyboard-first**: every primary action is reachable without the mouse.
- **Low-friction edits**: inline edits with clear “saving/saved/error” feedback.
- **Safe destructive actions**: delete requires confirmation and supports undo where feasible.

## Canonical Pattern: “Inline Edit + Autosave + Status”

### Editing
- **Cells are always editable** (no hidden click-to-edit mode).
- **Autosave on blur** (and/or short debounce) for text inputs/textarea/selects.
- Show a **row-level status**:
  - `Saving…` while request in-flight
  - `Saved` on success (brief)
  - `Error` with retry affordance on failure

### Save boundaries
- Edits are **persisted per entity**, not “save the whole page”.
- Large multi-field objects (e.g., steps list) should be persisted as **patches** when possible; only use whole-list writes when patching is not available yet.

### Undo / revert
- Provide **Undo** for destructive and structural actions when feasible:
  - Delete hazard / delete proposed control / delete action → undo toast for ~10s
  - Move hazard to another step → undo toast
  - Reorder → undo toast (optional)

## Entity Behaviors

### Process Steps
- **Add**: `+ Add step` row at bottom; immediately creates a step with placeholder fields and focuses the first editable cell.
- **Edit**: activity/equipment/substances/notes inline, autosave on blur.
- **Reorder**:
  - Primary: drag handle + drag-and-drop (mouse)
  - Keyboard: `Alt+↑` / `Alt+↓` to move step; persists immediately.
- **Delete**: delete step requires confirm; cascade deletes step↔hazard links (and attachments later).

### Hazards
- **Add**:
  - Always available from the same place: an “Add hazard” row under each step group, plus global add from “Unassigned hazards”.
  - Default assignment: current step (or unassigned).
- **Edit**: label/description/category/existing controls inline, autosave on blur.
- **Assign to steps**:
  - Mouse: “Move to step…” menu
  - Keyboard: `M` to open move menu; arrow/select; Enter to confirm
- **Reorder within a step**:
  - Mouse: drag handle within the step group
  - Keyboard: `Alt+↑` / `Alt+↓` moves hazard within its step group
- **Delete**: confirm + undo toast.

### Risk Assessments (Baseline + Residual)
- **Edit**: severity/likelihood dropdowns inline; autosave when both are present.
- **Validation feedback**: invalid combinations should block save and show an inline error message (not silent failure).
- **Visualization**: matrix updates optimistically from local state; reconcile on refresh.

### Controls
- **Existing controls**: inline textarea (one per line), autosave on blur.
- **Proposed controls**:
  - Add: inline “new control” input with optional hierarchy select; Enter to add.
  - Edit (optional later): inline edit for description/hierarchy.
  - Delete: confirm + undo toast.

### Actions
- **Add**:
  - Inline “add action” row per hazard group; hazard context is implicit.
  - Optional owner/due/status fields can be edited after creation.
- **Edit**: description/owner/due/status inline, autosave on blur (or on change for select).
- **Delete**: confirm + undo toast.

## Keyboard Shortcuts (Baseline)

These shortcuts should behave the same in all views (phase screens + overview table):
- `Enter`: commit current cell edit (blur + autosave).
- `Esc`: revert current cell to last saved value (local revert) and exit editing.
- `Tab` / `Shift+Tab`: move to next/previous editable cell.
- `Alt+↑` / `Alt+↓`: reorder the current row (step/hazard/action depending on context).
- `Ctrl+Enter` (or `Cmd+Enter`): “add row” in the current section (step/hazard/action).
- `Del` / `Backspace` (when not typing in an input): trigger delete (with confirm).
- `M`: open “move hazard to step” menu (hazard rows only).

## Visible Affordances
- Each row shows:
  - Drag handle (if reorderable)
  - Delete icon
  - Inline status indicator (`Saving…`, `Saved`, `Error`)
- The page shows a **global save/error banner** when any row is in error state.

## Migration Notes (From Current State)

Current UI mixes three patterns (draft+save, autosave on blur, explicit edit mode). The migration path:
1. Make steps behave like hazards (autosave + immediate reorder persistence).
2. Replace click-to-edit (overview hazard/action edits) with always-editable cells.
3. Use shared sheet components for all phases + overview.

