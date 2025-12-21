# JHA Guided Flow (Steps → Hazards → Controls → Review)

## Purpose
Define a staged JHA authoring flow that is user-driven, consistent with the HIRA phase navigation, and resilient to partial completion. The flow should guide users step-by-step without auto-finalizing content and should always allow manual edits before export.

## Design goals
- Reduce cognitive load by focusing on one task at a time.
- Keep the user in control: no auto-generated output is final until confirmed.
- Persist progress per stage so users can pause and resume.
- Align the review table with the PDF export output.

## Stage definitions

### Stage 1: Job steps
**Objective:** Capture the ordered list of job steps.
**Required fields:** Step label (non-empty).
**Actions:**
- Add step
- Reorder step
- Remove step (with warning if hazards exist)
**Completion rule:** At least one step with a non-empty label.

### Stage 2: Hazards per step
**Objective:** Capture hazards and consequences for each step.
**Required fields:** Hazard text, associated step.
**Actions:**
- Add hazard for a specific step
- Reorder hazards within a step
- Edit hazard and consequence
**Completion rule:** Each step has at least one hazard OR the user explicitly marks "No hazards for this step".

### Stage 3: Controls per hazard
**Objective:** Capture controls for each hazard.
**Required fields:** At least one control for each hazard OR user marks "No controls identified".
**Actions:**
- Add/remove controls for a hazard (multi-line list)
- Edit control wording
**Completion rule:** Each hazard has at least one control or an explicit "No controls" state.

### Stage 4: Review & edit
**Objective:** Present the full JHA table exactly as it will export.
**Actions:**
- Inline edit any field
- Reorder steps or hazards
- Jump back to stages 1-3 for structured editing
**Completion rule:** User can export once required fields from prior stages are met.

## Navigation and persistence
- Stage progression is linear by default but users can jump backward at any time.
- The current stage and completion status are persisted on the case.
- The user can resume at the last stage on reload.
- A lightweight progress indicator shows which stages are complete/incomplete.

## Validation rules
- Block stage progression if required fields are missing (except explicit "No hazards/controls").
- Provide clear, localized error messaging for missing data.
- Preserve user edits when validation fails; never discard input.

## LLM assistance (optional)
- Provide a helper panel in stages 1–3 that suggests content from a job description.
- The assistant output is always editable and never auto-applied.
- Users must confirm before overwriting existing entries.

## Copy guidance (EN/FR/DE)
- Keep stage titles short and action-oriented (e.g., "Define steps", "List hazards", "Add controls", "Review & export").
- Error messages should explain what is missing and why it matters.
- Use "No hazards identified" / "No controls identified" toggles to keep flow unblocked.

## Export alignment
- The review table must match the PDF export columns and order.
- The PDF should display the same step/hazard/control ordering shown in review.
