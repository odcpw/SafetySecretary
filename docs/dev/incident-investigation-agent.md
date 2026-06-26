# Incident Investigation Agent

The live Incident Investigation runtime is a Flue-backed investigation agent,
not a prompt-only chat completion.

One durable Flue agent instance is bound to one tenant incident. The app sends a
turn to that instance; the agent reads the current case-owned record, reasons
with the incident-investigation skill, uses typed tools to propose record
changes, validates those operations, and returns a short JSON reply plus
reviewable operations.

## Runtime Stack

| Layer | Role | Main paths |
|---|---|---|
| App chat surface | Persists user/assistant messages, proposal decisions, and streams progress. Defaults live turns to Flue unless explicitly opted out. | `src/lib/incident/coach-chat.ts`, `src/app/api/incidents/[id]/coach/chat/route.ts` |
| Flue runtime adapter | Sends each turn to a durable incident-bound Flue agent instance and waits on the durable event stream. | `src/lib/incident/coach-flue-runtime.ts`, `src/lib/incident/coach-flue-ids.ts` |
| Flue agent | Owns the turn contract, tool set, model selection, tenant/incident binding, and validation loop. | `.flue/agents/incident-investigation.ts` |
| Flue skill | Owns investigation doctrine: facts first, severity calibration, cause-tree discipline, STOP measures, anti-blame posture, and closeout judgment. | `.flue/skills/incident-investigation/SKILL.md` |
| Perception tools | Expose the current app-owned record, proposal ledger, cause-tree digest, and phase signal. | `read_incident_record`, `src/lib/incident/coach-flue-record-view.ts`, `src/lib/incident/cause-tree.ts` |
| Action tools | Convert intended record changes into validated structured operations. | `propose_incident_fields`, `propose_evidence`, `propose_cause_tree`, `propose_action_plan`, `propose_hira_followup` |
| Safety rails | Enforce enum validity, tenant scope, severity invariants, duplicate/cycle prevention, and apply-time correctness. | `src/lib/incident/coach-flue-operation-tools.ts`, `src/lib/agent/incident-investigation/apply-operation.ts`, `src/lib/incident/classification.ts` |
| Case Lab | Replays real case studies through agent variants and judges investigation quality. | `docs/dev/case-lab.md`, `scripts/case-lab/` |

## Intelligence Boundary

The agent intelligence is the combination of:

- Flue agent instructions;
- the `incident-investigation` skill;
- the record reader and phase/cause/proposal digests;
- typed proposal tools and validation feedback;
- deterministic backend guards;
- Case Lab evidence about what works.

`src/lib/incident/coach-prompt.ts` is still important, but it is not the live
product brain. It is the fallback dispatch/Pi prompt and a shared compatibility
contract for operation kinds. When Flue is available, the canonical behavior is
the Flue agent plus Flue skill and tools.

Backend guards are not the intelligence. They are last-resort safety rails. A
good agent should propose the right severity, fact, cause, and measure before an
apply-time guard has to correct or reject it.

## Turn Loop

Every useful turn follows the same agent loop:

1. `read_incident_record` to see the current record and proposal decisions.
2. Decide what the case needs next: one clarifying question, a structured update,
   contradiction resolution, cause-tree deepening, measure capture, or no-op
   explanation.
3. Use typed proposal tools for changes.
4. Call `validate_incident_operations` when operations are emitted.
5. Return strict JSON with the user-facing reply and validated operations.

Do not bypass this loop by hand-writing operations or treating the latest user
message as the whole case.

## Fallback Runtime

The live default is Flue. The dispatch/Pi path remains for explicit opt-out,
tests, and compatibility:

- Flue default: no `SAFETYSECRETARY_II_COACH_RUNTIME` override, unless a mock
  seed is configured for deterministic tests.
- Pi/dispatch fallback: `SAFETYSECRETARY_II_COACH_RUNTIME=pi`.

Fallback behavior must not become the architectural source of truth again.

## How To Improve It

Improve the agent by changing the layer that owns the problem:

- Investigation doctrine: edit `.flue/skills/incident-investigation/SKILL.md`.
- Tool affordance or validation feedback: edit `.flue/agents/incident-investigation.ts`
  or `src/lib/incident/coach-flue-operation-tools.ts`.
- App safety invariant: edit `apply-operation.ts` or classification helpers.
- Record visibility: edit `coach-flue-record-view.ts`, `cause-tree.ts`, or the
  proposal digest.
- Quality comparison: add or replay Case Lab case studies.

After changing Flue behavior, run:

```bash
pnpm test:incidents:coach-flue
pnpm test:case-lab
pnpm typecheck
pnpm flue:build
```

Use real Case Lab replays when the change affects investigation behavior, not
only plumbing.
