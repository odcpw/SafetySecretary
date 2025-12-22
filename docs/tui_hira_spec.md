# TUI HIRA Spec (WebTUI-native)

This spec defines the terminal-style HIRA experience for the TUI entry. It is the contract for scope, navigation, and interaction patterns during the build phase.

## Goals
- End-to-end HIRA completion without switching to the GUI.
- Keyboard-first interaction model with clear edit modes.
- WebTUI-native styling only (monospace, ch/lh sizing, ASCII boxes).
- Reuse existing RA data flows and APIs (no new backend endpoints).

## Non-goals (Phase 1)
- Attachments UI (photos, hazard attachments).
- JHA and Incident workflows.

## IA + Routes
- `/tui` -> TUI Home
- `/tui/hira` -> HIRA landing (create, load, recent)
- `/tui/cases/:caseId` -> HIRA case shell

## Phase Mapping
HIRA phases must align with API phase state:
- PROCESS_STEPS
- HAZARD_IDENTIFICATION
- RISK_RATING (baseline)
- CONTROL_DISCUSSION (controls)
- RESIDUAL_RISK (residual rating)
- ACTIONS
- COMPLETE

## Layout Model
Each phase screen uses a consistent layout:
- Header: case summary + global actions
- Stepper: phase navigation + next/prev
- Body: primary editor panel(s)
- Status line: ready/saving/error/parsing/applying/editing

## Navigation + Keyboard Model
Global shortcuts (documented in UI):
- Arrow keys: move between rows/cells
- Enter: enter edit mode
- Esc: exit edit mode
- Ctrl+S: save current form/row (where relevant)
- Ctrl+G: focus global LLM prompt

Focus rules:
- Only one active row/field at a time.
- Edit mode is explicit and visible (cursor or highlight).
- Status line reflects editing/parsing/saving states.

## LLM Flows (In Scope)
### Global Contextual Prompt
- Available in the case shell.
- Parse -> clarify -> apply loop is visible with status and errors.
- Users can exit clarification without losing context.

### Phase Assistant Panels
- Process Steps: extract steps from narrative.
- Hazard Identification: extract hazards from narrative.
- Controls: extract proposed controls from notes.
- Actions: extract actions from notes.

LLM UI must show: parsing, success, and error states.

## Phase-by-Phase Parity Matrix
### Process Steps
Must-have:
- Create, edit, delete, reorder steps.
- Auto-save + error handling.
- Assistant panel for extraction.
Defer:
- Attachments.

### Hazard Identification
Must-have:
- Add/edit/delete/reorder hazards.
- Move hazards between steps.
- Category + existing controls editing.
- Assistant panel for extraction.
Defer:
- Attachments.

### Risk Rating (Baseline)
Must-have:
- Set/clear baseline severity + likelihood.
- Save state per hazard row.
Defer:
- Residual (handled in next phase).

### Controls + Residual Risk
Must-have:
- Add/edit/remove controls (with hierarchy).
- Set/clear residual severity + likelihood.
- Assistant panel for controls extraction.

### Actions
Must-have:
- Add/edit/delete/reorder actions.
- Owner, due date, status updates.
- Assistant panel for actions extraction.

### Review/Complete
Must-have:
- Read-only summary (steps, hazards, actions).
- Export PDF/XLSX.
- Advance to COMPLETE.

## Status + Error Surface Rules
- Status line is visible without scrolling.
- Errors are text-first and actionable.
- Empty states tell the user what to do next.

