## Change: Centralize Flue model resolution for the incident agent and live story harness

### Equivalence contract
- **Inputs covered:** Flue agent model selection in [.flue/agents/incident-investigation.ts](/home/oliver/Projects/odcpw/SafetySecretaryNext/.flue/agents/incident-investigation.ts:201), live story harness model selection in [scripts/agent-runtime/run-flue-incident-story.ts](/home/oliver/Projects/odcpw/SafetySecretaryNext/scripts/agent-runtime/run-flue-incident-story.ts:67), and focused semantic coverage in [tests/unit/incidents/coach-flue-agent-model.test.ts](/home/oliver/Projects/odcpw/SafetySecretaryNext/tests/unit/incidents/coach-flue-agent-model.test.ts:10)
- **Ordering preserved:** yes; both callsites still resolve the model before constructing the agent or mutating `process.env`
- **Tie-breaking:** unchanged; trimmed non-empty `SSFW_FLUE_MODEL` still wins, otherwise the same default model is used
- **Error semantics:** unchanged; no new throws, catches, or fallback branches were introduced
- **Laziness:** unchanged; model resolution remains eager at the same callsites
- **Short-circuit eval:** unchanged; the helper still implements `trim -> non-empty -> default`
- **Floating-point:** N/A
- **RNG / hash order:** unchanged; no UUID, hashing, or ordering logic changed
- **Observable side-effects:** identical selected model string in the Flue agent and story harness; the story harness still writes the resolved value back to `process.env.SSFW_FLUE_MODEL`
- **Type narrowing:** unchanged; only a string-returning helper was extracted
- **Rerender behavior:** N/A

### Verification
- [x] `node --experimental-strip-types --experimental-specifier-resolution=node --test tests/unit/incidents/coach-flue-agent-model.test.ts`
- [x] `pnpm test:incidents:coach-flue`
- [x] `pnpm flue:build`
- [x] `pnpm typecheck`
- [x] `rg -n "process\.env\.SSFW_PI_MODEL|process\.env\.LLM_TEXT_MODEL" .flue/agents scripts/agent-runtime tests/unit/incidents/coach-flue-agent-model.test.ts`
- [x] LOC delta recorded in `ledger.md`
