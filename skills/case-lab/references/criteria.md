# Case Lab Criteria

Use these principles when interpreting or changing `scripts/case-lab/evaluator.ts`.

## Frames

- **Production baseline**: what the real case stored. Useful for regression comparison, never assumed to be correct.
- **Adjudicated quality**: what a good investigation should have captured or asked. This is the headline judgment.
- **Runtime mechanics**: whether the replay path, tenant lifecycle, operations, and artifacts behaved correctly.

Keep these frames separate in reports.

## Hard Failures

A run is `failing-critical` when any hard failure is present, regardless of weighted score.

Current hard failures:

- Fatality severity mismatch: if source or replay potential-outcome text says fatal, death, killed, or lethal, replay `potentialSeverityCode` must be `A`.
- Broken schema/provisioning, failed operation application, or leaked simulation tenant.
- Dangerous export surface, especially auth/session/OAuth material or avoidable user PII.

Add hard failures sparingly. Use them only for issues that make the run unsafe or materially misleading.

## Severity Invariants

- `A`: credible death/fatality path.
- `B`: irreversible injury or permanent disability without death.
- `C`: lost work time, including hospital admission/serious care likely to keep someone off work, even if they first went home.
- `D`: doctor/clinic/ER treatment without missed work.
- `E`: first aid only.

If the user description does not reveal the credible worst case, the coach should ask the A-E potential-harm question before emitting `potentialSeverityCode`.

## Weighted Categories

- `fact_capture`: important user-provided facts appear in the final record.
- `timeline_quality`: user-provided dates land in the main incident date when appropriate, not only narrative timeline rows.
- `classification`: type, actual outcome, hazard, event type, and potential severity are coherent.
- `investigation_logic`: cause branches are no-blame, open when incomplete, and track the case logic.
- `next_question`: assistant asks a case-progressing question when the investigation is incomplete.
- `operation_safety`: no invented timestamps, measures, owners, or corrective actions.
- `method_switch`: method switch turns do not mutate the record unless the user accepts restructuring.

## Known Limitation

The first executable criteria version still contains HCN/Siegfried-specific checks. Before broad corpus optimization, move case-specific requirements into per-case expectation files and keep only invariants in shared code.
