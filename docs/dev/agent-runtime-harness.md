# Agent Runtime Harness

`scripts/agent-runtime/validate-agent-runtime.ts` is the manual ADR-0006 D10
agent-runtime harness. It proves the Safety Secretary runtime can execute a
deterministic agent transport on synthetic incident context, record redacted
runtime / skill / package evidence, and refuse to run outside explicit manual
validation.

The harness is intentionally not wired into default tests or CI. It refuses to
run unless `LLM_VALIDATION_OK=1` is set.

## Run

```bash
node --experimental-strip-types --experimental-specifier-resolution=node scripts/agent-runtime/validate-agent-runtime.ts
```

Expected: non-zero exit with an ADR-0005 D7 / ADR-0006 D10 message.

```bash
LLM_VALIDATION_OK=1 node --experimental-strip-types --experimental-specifier-resolution=node scripts/agent-runtime/validate-agent-runtime.ts
```

Expected:

- Pi package evidence is recorded from the local `pi` CLI when available.
- The fake agent transport runs against synthetic II context.
- The context bundle includes photo references only, not photo bytes.
- The resulting trace records redacted model-call and verification summaries.
- No real provider is constructed.

To write a report:

```bash
LLM_VALIDATION_OK=1 node --experimental-strip-types --experimental-specifier-resolution=node scripts/agent-runtime/validate-agent-runtime.ts --write-evidence
```

Reports are written under `evidence/agent-runtime/`.

## CI Boundary

This harness is a manual product-acceptance check. Default CI should run the
unit tests for the fake transport and redaction guard, but it must not set
`LLM_VALIDATION_OK=1` or run this script as a normal test.

The later Pi transport adapter can extend this harness, but it must keep the
same contract: synthetic data only, no operator-global credentials as product
state, no secrets in evidence, and no unredacted prompt / response bodies.
