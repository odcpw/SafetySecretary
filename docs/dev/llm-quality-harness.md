# LLM Quality Harness

`scripts/llm-eval/eval-gemma-quality.ts` is the manual ADR-0005 D8 harness
for measuring whether the local Gemma path is good enough for Safety
Secretary task families.

The harness is measurement, not CI. It refuses to run unless
`LLM_VALIDATION_OK=1` is set, and it must never be wired into default tests or
GitHub Actions. It uses synthetic text prompts and synthetic diagram images
only: no real workplace photos, incidents, people, locations, or company data.

## Fixture Corpus

Text fixtures live under `tests/fixtures/llm-eval/text/`.

The corpus covers eight task families, with 10 prompts per family:

- step extraction
- hazard extraction
- SUVA category proposal
- severity / likelihood suggestion
- action rewording
- S-T-O-P control proposal
- incident-investigation 5-Whys turn
- cross-HIRA copy-not-link suggestion

Vision fixtures live under `tests/fixtures/llm-eval/vision/`. The manifest
covers all 12 canonical SUVA hazard category codes from the taxonomy fixtures.
The images are generated PNG diagrams with no metadata chunks.

## Generate Or Refresh Fixtures

```bash
LLM_VALIDATION_OK=1 node --experimental-strip-types --experimental-specifier-resolution=node scripts/llm-eval/eval-gemma-quality.ts --write-fixtures --fake-loopback
```

The same command also runs the fixture corpus against a loopback fake server and
writes `evidence/llm-eval/<YYYY-MM-DD>.md`.

## Guardrail Check

```bash
node --experimental-strip-types --experimental-specifier-resolution=node scripts/llm-eval/eval-gemma-quality.ts
```

Expected: non-zero exit with an ADR-0005 D7 / D8 message because
`LLM_VALIDATION_OK=1` is missing.

## Loopback Validation

```bash
LLM_VALIDATION_OK=1 node --experimental-strip-types --experimental-specifier-resolution=node scripts/llm-eval/eval-gemma-quality.ts --fake-loopback
```

Expected:

- fixture cardinality checks pass;
- vision fixtures cover all 12 SUVA category codes;
- PNG metadata checks pass;
- 80 text fixtures and 12 vision fixtures execute against the loopback
  OpenAI-compatible fake server;
- the report is written under `evidence/llm-eval/`.

## Real Gemma / OpenAI Comparison

For a real local Gemma run, point the OpenAI-compatible variables at the local
endpoint:

```bash
LLM_VALIDATION_OK=1 \
LLM_BASE_URL=http://127.0.0.1:11434/v1 \
LLM_API_KEY=local-placeholder \
LLM_TEXT_MODEL=gemma3 \
LLM_VISION_MODEL=gemma3 \
node --experimental-strip-types --experimental-specifier-resolution=node scripts/llm-eval/eval-gemma-quality.ts
```

If `OPENAI_API_KEY` is present, the same fixtures also run against OpenAI and
the report includes the side-by-side rows. If `OPENAI_API_KEY` is absent, the
OpenAI leg is skipped and the report states that explicitly.

## Reviewer Sign-Off

Each report includes a sign-off checklist for a human reviewer:

- inspect failed rows and sample outputs;
- confirm fixtures contain no real workplace photos, people, company data, or
  incident facts;
- record whether Gemma quality is acceptable for the next release decision.
