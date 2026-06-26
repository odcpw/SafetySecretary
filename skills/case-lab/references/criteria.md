# Case Lab Criteria

Use these principles when interpreting or changing `scripts/case-lab/case-study.ts`.

## Frames

- **Actual Case**: the canonical extracted benchmark used by the adaptive
  simulated user and evaluator. It contains the narrative, facts,
  classification, causes, actual measures, uncertainties, and evidence
  references.
- **Case study**: the replay wrapper around the Actual Case.
- **Production baseline**: what the real case stored. Useful evidence, never assumed to be correct.
- **Adjudicated quality**: what a good investigation should have captured, asked, classified, and turned into causes/measures. This is the headline judgment.
- **Runtime mechanics**: whether the replay path, tenant lifecycle, operations, and artifacts behaved correctly.

Keep these frames separate in reports.

The central investigation chain is: facts -> causal conditions -> pragmatic
measures. The evaluator can emit a numeric score, but the score is only useful
when it explains whether that chain became actionable for a manager.

## Hard Failures

A run is `failing-critical` when any hard failure is present, regardless of weighted score.

Current `evaluation.json` hard failures:

- Fatality severity mismatch: if the Actual Case expects `A`, replay `potentialSeverityCode` must be `A`.

Run-invalid operator failures are separate from weighted evaluator checks:

- Case mismatch: applying one case's rubric to another case, such as HCN checks against a Fräsmaschine amputation case.
- Broken schema/provisioning.
- Failed operation application.
- Leaked simulation tenant.
- Dangerous export surface, especially auth/session/OAuth material or avoidable user PII.

These may abort a replay before `evaluation.json` exists. If they are detected
only in artifacts, report them as invalid-run defects rather than hiding them in
a normal weighted score.

Add hard failures sparingly. Use them only for issues that make the run unsafe or materially misleading.

## Severity Invariants

- `A`: credible death/fatality path.
- `B`: irreversible injury or permanent disability without death.
- `C`: lost work time, including hospital admission/serious care likely to keep someone off work, even if they first went home.
- `D`: doctor/clinic/ER treatment without missed work.
- `E`: first aid only.

If the user description does not reveal the credible worst case, the coach should ask the A-E potential-harm question before emitting `potentialSeverityCode`.

## Weighted Categories

- `classification`: type, actual outcome, hazard, event type, and potential severity match the Actual Case.
- `fact_capture`: required Actual Case facts appear in the final record.
- `questioning`: the coach surfaced important facts by asking into the right topics.
- `investigation_logic`: cause branches track this Actual Case's logic.
- `measures`: actual measures appear only when the Actual Case provides them.
- `case_chain`: surfaced facts support captured causes; measures are linked to
  causes and are implementable enough to assign and follow up.
- `operation_safety`: no corrective actions before agreed measures are revealed,
  no measures hidden in fact rows, and no invented owners or due dates.
- `agent_reasoning`: the coach's proposed operations were right before backend guards normalized them.
- `runtime`: replay artifacts are complete and tenant cleanup succeeds.

Treat a vague action such as "discuss this" without a cause link, owner, and due
date as weak even if it technically creates a stop action. A useful measure
should answer: what condition changes, who owns it, and by when.

## Known Limitation

Production data can contain contradictions. Example: a potential-outcome text may say fatal while the stored code is `E`. The study builder must derive the expected severity from the case logic rather than trusting a contradictory stored field.
