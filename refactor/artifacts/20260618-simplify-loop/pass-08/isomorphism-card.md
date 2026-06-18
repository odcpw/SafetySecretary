## Change: Extract file-local detail row renderer in StructuredOperationReview

### Equivalence contract
- **Inputs covered:** `payload.details` summary rows and traceability rows for skill, run, operation, and optional target.
- **Ordering preserved:** yes; arrays are rendered in the same order as the previous inline JSX blocks.
- **Tie-breaking:** unchanged; existing payload detail rows still use `detail.label` as the React key.
- **Error semantics:** unchanged; no new error paths or validation.
- **Laziness:** unchanged; detail row arrays are already materialized before render.
- **Short-circuit eval:** unchanged; the optional target row is still rendered only when `targetLabel` is truthy.
- **Floating-point:** N/A.
- **RNG / hash order:** N/A.
- **Observable side-effects:** unchanged; render-only JSX helper, no effects, logging, storage, network, or mutations.
- **Type narrowing:** unchanged; `operation.target` narrowing stays in `targetLabelFor`, and operation summary narrowing stays in `summarizeOperation`.
- **Rerender behavior:** same hooks, same hook order, same memo dependency arrays, same Suspense/error-boundary position, same DOM element order and class strings. The helper is a plain render function, not a new stateful component.

### Verification
- [x] `pnpm test:agent`
- [x] `pnpm typecheck`
- [x] `git diff --check`
