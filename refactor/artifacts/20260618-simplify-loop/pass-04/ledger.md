# Pass 04 Ledger

Generated: 2026-06-18
Candidate: shared Flue model-resolution helper for agent/story boundaries
Decision: landed
Opportunity score: `5.0` = `(LOC bucket 1 * confidence 5) / risk 1`

## LOC delta

| File | Approx. delta | Why |
|---|---:|---|
| `.flue/agents/incident-investigation.ts` | `+1` | Replaced the local `SSFW_FLUE_MODEL` trim/default expression with a shared helper call |
| `src/lib/incident/coach-flue-config.ts` | `+8` | Introduced the shared Flue model resolver and default constant |
| `scripts/agent-runtime/run-flue-incident-story.ts` | `+3` | Reused the shared helper instead of carrying a second local trim/default expression |
| `tests/unit/incidents/coach-flue-agent-model.test.ts` | `+10` | Switched from source-text fallback assertions to direct semantic coverage of trim/default behavior plus shared-helper usage |
| **Net touched-file delta** | **`+22`** | Small helper extraction and better semantic coverage reduced config coupling but did not target net-negative LOC in this bounded pass |

## Rationale

- This was a Type II clone on a high-signal configuration boundary:
  - `.flue` agent runtime and live story harness each owned the same trim/default fallback
  - the test was coupled to that exact source text instead of the actual ownership rule
- The landed helper is deliberately narrow:
  - one env variable: `SSFW_FLUE_MODEL`
  - one default: `openai/gpt-5.5`
  - no agent-name, token, base-url, or instance-id changes
- The test now proves the behavior that matters:
  - undefined, empty, and whitespace-only values fall back
  - non-empty values are trimmed and preserved
  - both scoped files use the shared helper

## Checks kept unchanged

- One Flue agent instance still maps to one tenant incident via the existing encoded instance id authority model
- No `SSFW_PI_MODEL` or `LLM_TEXT_MODEL` fallback was added to any Flue path
- The story harness still persists the resolved Flue model back into `process.env.SSFW_FLUE_MODEL` before running and restarting Flue
- The runtime path in `src/lib/incident/coach-flue-runtime.ts` was intentionally left behaviorally unchanged in this pass
