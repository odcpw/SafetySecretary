## Change: Narrow Flue incident raw operation payload type

### Candidate Score

| Candidate | Lever | LOC | Confidence | Risk | Score | Decision |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Replace exported `FlueRawOperation.payload: Record<string, unknown>` with a closed payload union keyed by existing `AgentOperationKind` literals | L-TYPE-SHRINK | 1 | 5 | 1 | 5.0 | Ship |

Scoring note: this pass scores type-surface shrink rather than runtime LOC deletion. The broader exported `Record<string, unknown>` currently permits malformed builder outputs that all current callsites and tests already assume are one of the II operation payload shapes. The final form uses a local payload-by-kind map and `FlueRawOperationOf<K>` helper to keep `kind` and `payload` paired without repeating the operation object shell.

### Equivalence Contract

- **Inputs covered:** `buildFlueIncidentFieldOperations`, `buildFlueEvidenceOperations`, `buildFlueCauseTreeOperations`, `buildFlueHiraFollowupOperations`, and `validateFlueRawIncidentOperations`.
- **Ordering preserved:** Yes. The builders still push operations in the same loops and order; only the compile-time payload type changes.
- **Tie-breaking:** Unchanged. Duplicate fact matching, cause sorting, and ref handling are untouched.
- **Error semantics:** Unchanged. No runtime validation code or error strings change.
- **Laziness:** N/A. No iteration strategy changes.
- **Short-circuit eval:** Unchanged. No conditions change.
- **Floating-point:** N/A.
- **RNG / hash order:** N/A.
- **Observable side-effects:** Identical. The tool JSON output shape remains the same because this is type-only.
- **Type narrowing:** The exported raw operation payload becomes a discriminated union of the six operation kinds emitted by this module. `FlueRawOperationOf<K>` preserves the `AgentOperationKind` literal as the discriminant and indexes the matching payload type from the local map. Existing app-facing `validateFlueRawIncidentOperations` remains `unknown[]` because it validates model output at the raw boundary.
- **Rerender behavior:** N/A.

### Verification Plan

- [x] Baseline focused test before edit: `node --experimental-strip-types --experimental-specifier-resolution=node --test tests/unit/incidents/coach-flue-operation-tools.test.ts` — 11 pass, 0 fail.
- [x] Focused test after edit: `node --experimental-strip-types --experimental-specifier-resolution=node --test tests/unit/incidents/coach-flue-operation-tools.test.ts` — 11 pass, 0 fail.
- [x] Broader Flue coach unit suite: `pnpm test:incidents:coach-flue` — 25 pass, 0 fail.
- [x] Focused test after helper refinement: `node --experimental-strip-types --experimental-specifier-resolution=node --test tests/unit/incidents/coach-flue-operation-tools.test.ts` — 11 pass, 0 fail.
- [x] Typecheck after helper refinement: `pnpm typecheck` — no diagnostics.
- [x] Diff hygiene after helper refinement: `git diff --check` — no whitespace errors.
