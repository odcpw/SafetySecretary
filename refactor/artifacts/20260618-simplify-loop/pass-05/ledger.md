# Pass 05 Ledger

Generated: 2026-06-18
Candidate: C5 narrow slice - shared ISO date/time predicate inside Flue proposal validation
Decision: landed
Opportunity score: `3.0` = `(LOC bucket 1 * confidence 3) / risk 1`

## LOC delta

| File | Approx. delta | Why |
|---|---:|---|
| `src/lib/incident/coach-flue-operation-tools.ts` | `+7` | Replaced three repeated `new Date(...).getTime()` invalidity checks with one file-local predicate |
| `tests/unit/incidents/coach-flue-operation-tools.test.ts` | `+61` | Added missing proofs for `incidentAt` and timeline `occurredAt` message parity plus accepted-operation ordering |
| **Net touched-file delta** | **`+68`** | Small helper extraction with proof-heavy tests; bounded simplification, not a net-negative LOC pass |

## Rationale

- The original broader C5 shape was too risky for this pass:
  - extracting a shared proposal-builder scaffold would have coupled unrelated validation loops
  - the user-visible strings and ordering rules differ too much across field, evidence, cause, and HIRA builders
- The repeated ISO date/time parse check was the safe common seam:
  - same expression in three places
  - no enum behavior, due-date regex behavior, or operation-construction order needed to move
  - caller-local error strings remained untouched
- The added tests close the proof gap that existed before this pass:
  - builder-level `incidentAt` error parity
  - builder-level timeline `occurredAt` error parity
  - accepted-operation order after invalid date rows

## Checks kept unchanged

- Enum validation still uses the existing per-field code lists and unchanged error messages
- `stop_action dueDate` validation still uses its stricter `YYYY-MM-DD` regex path and was not generalized into the new helper
- Builder-level timeline validation still reports `occurredAt is invalid` while raw operation validation still reports `must be an ISO date/time`
- Empty-input guards and `proposalResult({ errors, operations })` exits were intentionally left as-is rather than introducing a shared builder abstraction
