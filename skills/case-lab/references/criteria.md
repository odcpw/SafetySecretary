# Case Lab Criteria

Use these principles when interpreting or changing `scripts/case-lab/case-study.ts`.

## Frames

- **Case study**: the structured case file used by the adaptive simulated user.
- **Production baseline**: what the real case stored. Useful evidence, never assumed to be correct.
- **Adjudicated quality**: what a good investigation should have captured, asked, classified, and turned into causes/measures. This is the headline judgment.
- **Runtime mechanics**: whether the replay path, tenant lifecycle, operations, and artifacts behaved correctly.

Keep these frames separate in reports.

## Hard Failures

A run is `failing-critical` when any hard failure is present, regardless of weighted score.

Current hard failures:

- Fatality severity mismatch: if source or replay potential-outcome text says fatal, death, killed, or lethal, replay `potentialSeverityCode` must be `A`.
- Case mismatch: applying one case's rubric to another case, such as HCN checks against a Fräsmaschine amputation case.
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

- `classification`: type, actual outcome, hazard, event type, and potential severity match this study.
- `fact_capture`: required case-study facts appear in the final record.
- `questioning`: the coach surfaced important facts by asking into the right topics.
- `investigation_logic`: cause branches track this case's actual logic.
- `measures`: action themes appear only when the study provides them.
- `operation_safety`: no invented timestamps, measures, owners, or corrective actions.
- `runtime`: replay artifacts are complete and tenant cleanup succeeds.

## Known Limitation

Production data can contain contradictions. Example: a potential-outcome text may say fatal while the stored code is `E`. The study builder must derive the expected severity from the case logic rather than trusting a contradictory stored field.
