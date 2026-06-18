# Pass 7 Ledger

## Candidate

| Candidate | Scope | Lever | LOC | Confidence | Risk | Score | Decision |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| Narrow `FlueRawOperation.payload` | `src/lib/incident/coach-flue-operation-tools.ts` exported Flue proposal result boundary | L-TYPE-SHRINK | 1 | 5 | 1 | 5.0 | Shipped |

## Change

Replaced the exported `payload: Record<string, unknown>` in `FlueRawOperation` with a discriminated union keyed by the existing `AgentOperationKind` literals emitted by this module. The final version uses a local `FlueRawOperationPayloadByKind` map plus `FlueRawOperationOf<K>` helper so the discriminant and payload pairing is listed once:

- `incident_field_update` -> `AgentIncidentFieldUpdatePayload`
- `fact` -> `AgentFactPayload`
- `timeline_event` -> `AgentTimelineEventPayload`
- `cause_node` -> `AgentCauseNodePayload`
- `cause_update` -> `AgentCauseUpdatePayload`
- `hira_followup_note` -> `AgentHiraFollowupPayload`

`validateFlueRawIncidentOperations` intentionally remains `unknown[]`; it is the model-output validation boundary and must keep accepting untrusted raw records.

## LOC Delta

From `git diff --numstat` after helper refinement:

| File | Added | Deleted | Net |
| --- | ---: | ---: | ---: |
| `src/lib/incident/coach-flue-operation-tools.ts` | 23 | 3 | +20 |

Source file line count: `807 -> 827`.

The helper refinement removed 11 lines from the initial explicit-union version while preserving the same literal narrowing.

This pass is productive despite positive LOC because the mission is type surface shrink: an exported raw-builder boundary now rejects malformed payload shapes at compile time.

## Rejections / Already Correct

| Area | Decision | Reason |
| --- | --- | --- |
| `src/lib/incident/coach-flue-record-view.ts` exported view types | Leave | The view is deliberately JSON-shaped and trims records through `pickRecord`; narrowing individual record keys would either duplicate the field lists into exported types or overfit tests. |
| `src/lib/incident/coach-flue-action-plan.ts` raw operation type | Already correct | It already uses a closed discriminated union for the Flue action-plan raw operation boundary. |
| `src/lib/incident/coach-chat.ts`, `src/lib/incident/coach-proposal-digest.ts`, `src/components/incident/coach/CoachWorkbench.tsx` payload gist helpers | Leave | They consume persisted/model-derived `AgentStructuredOperation` payloads across multiple operation kinds. Extracting shared key probing is a Type III formatting change and outside this pass's one-lever type boundary. |
| `src/lib/auth/invitations.ts` / `src/lib/email/transport.ts` email aliases | Leave | `InvitationEmail` is a deliberate alias to the transactional transport contract and avoids duplicating transport payload fields after pass 2. |
| `src/lib/agent/runtime.ts` / `src/lib/agent/tool-registry.ts` generic runtime/tool types | Leave | The generic schema and invocation surfaces preserve input/output inference for registered tools; narrowing them from this pass would widen casts at callsites or break the registry abstraction. |
| `src/lib/agent/fake-transport.ts` exported fixture interfaces | Already correct | Pass 6 clarified this as deterministic test/manual-harness infrastructure; the seed/result shapes are used by runtime-path tests. |

## Verdict

PRODUCTIVE
