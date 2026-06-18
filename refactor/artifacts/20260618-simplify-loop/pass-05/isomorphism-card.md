## Change: Extract a single file-local ISO date/time predicate for Flue proposal validation

### Equivalence contract
- **Inputs covered:** `incidentAt` field normalization in [src/lib/incident/coach-flue-operation-tools.ts](/home/oliver/Projects/odcpw/SafetySecretaryNext/src/lib/incident/coach-flue-operation-tools.ts:663), builder-level timeline `occurredAt` checks in [src/lib/incident/coach-flue-operation-tools.ts](/home/oliver/Projects/odcpw/SafetySecretaryNext/src/lib/incident/coach-flue-operation-tools.ts:217), raw operation timeline `occurredAt` checks in [src/lib/incident/coach-flue-operation-tools.ts](/home/oliver/Projects/odcpw/SafetySecretaryNext/src/lib/incident/coach-flue-operation-tools.ts:450), and focused assertions in [tests/unit/incidents/coach-flue-operation-tools.test.ts](/home/oliver/Projects/odcpw/SafetySecretaryNext/tests/unit/incidents/coach-flue-operation-tools.test.ts:74) and [tests/unit/incidents/coach-flue-operation-tools.test.ts](/home/oliver/Projects/odcpw/SafetySecretaryNext/tests/unit/incidents/coach-flue-operation-tools.test.ts:136)
- **Ordering preserved:** yes; each builder still iterates proposals in the same order, pushes the same successful operations in the same positions, and skips invalid rows at the same branch points
- **Tie-breaking:** unchanged; there is no ranking or first-match change beyond the existing first-invalid-branch behavior
- **Error semantics:** unchanged; each caller keeps its original user-visible string: `incidentAt must be an ISO date/time`, `Timeline event N occurredAt is invalid.`, and `timeline_event occurredAt must be an ISO date/time.`
- **Laziness:** unchanged; validation remains eager at the same points in each loop
- **Short-circuit eval:** unchanged; each callsite still guards the parse check with the same non-empty string condition before validating
- **Floating-point:** N/A
- **RNG / hash order:** unchanged; no randomization or map iteration semantics changed
- **Observable side-effects:** identical accepted/rejected operations and identical payload normalization for valid dates; no logging, storage, or external calls were added
- **Type narrowing:** unchanged; the extracted helper returns only a boolean and does not widen any payload types
- **Rerender behavior:** N/A

### Verification
- [x] `node --experimental-strip-types --experimental-specifier-resolution=node --test tests/unit/incidents/coach-flue-operation-tools.test.ts tests/unit/incidents/coach-flue-action-plan.test.ts`
- [x] `pnpm test:incidents:coach-flue`
- [x] `pnpm typecheck`
- [x] Exact builder-level tests added for `incidentAt` and timeline `occurredAt` message/order parity
- [x] LOC delta recorded in `ledger.md`
