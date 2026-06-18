## Change: Clarify AgentFakeTransport as synthetic test infrastructure

### Equivalence contract
- **Inputs covered:** All callers of `AgentFakeTransport`, including `tests/unit/agent/fake-transport.test.ts`, `tests/unit/agent/runtime.test.ts`, and `scripts/agent-runtime/validate-agent-runtime.ts`.
- **Ordering preserved:** Yes. Comment-only source change; map construction, lookup, and emitted operation order are unchanged.
- **Tie-breaking:** Unchanged. Duplicate seed detection still uses the same key and first duplicate error behavior.
- **Error semantics:** Unchanged. No thrown classes, categories, messages, or user-safe messages changed.
- **Laziness:** Unchanged. No eager work added.
- **Short-circuit eval:** Unchanged. Abort and missing-fixture checks are untouched.
- **Floating-point:** N/A.
- **RNG / hash order:** Unchanged. Context digest and seed map key behavior are untouched.
- **Observable side-effects:** Unchanged. Runtime traces, model-call evidence, verification checks, and redaction guard behavior are untouched.
- **Type narrowing:** Unchanged. No type signatures or exports changed.
- **Rerender behavior:** N/A.

### Verification
- [x] `pnpm test:agent`
- [x] `node --experimental-strip-types --experimental-specifier-resolution=node --test tests/unit/llm/mock.test.ts`
- [x] `pnpm typecheck`
