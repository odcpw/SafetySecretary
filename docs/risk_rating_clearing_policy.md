# Risk Rating Clearing Policy (Baseline + Residual)

Purpose: define when ratings can be cleared, how "cleared" is represented in data, and how the UI should behave.

## Decisions

### Optional vs required
- Baseline and residual ratings are **optional** in beta.
- Users can clear ratings at any phase without being blocked.
- Rationale: avoids hard stops for incomplete assessments during beta testing.

### What "cleared" means
- **Cleared = no `HazardAssessment` row** for the given `hazardId` + `type`.
- Do **not** store empty strings or placeholder values in `severity`/`likelihood`.
- Rationale: avoids invalid rows and keeps reporting logic simple (absence = not rated).

### UI behavior
- Provide an explicit "Clear rating" action (or blank option in the dropdown).
- Only save when both severity and likelihood are selected.
- If a user clears one field, treat the rating as cleared and remove the assessment row.
- Risk matrices and exports should show an empty/unrated state when cleared.

## Implementation Guidance
- Backend: accept a clear action by deleting the `HazardAssessment` row for that type.
- Frontend: do not show "Saving..." unless a request is actually sent.
- Validation: prevent partial saves (severity without likelihood, or vice versa).

## Impacted beads
- SafetySecretary-qt8.2 (backend support)
- SafetySecretary-qt8.3 (frontend support)
- SafetySecretary-qt8.4 (tests)
