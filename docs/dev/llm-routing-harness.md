# LLM Local Routing Harness

`scripts/llm-eval/eval-local-routing.ts` is the manual ADR-0005 D7 local-routing harness for proving that the local override path reaches only a loopback OpenAI-compatible endpoint.

The harness is intentionally not wired into default tests or CI. It refuses to run unless the operator explicitly sets `LLM_VALIDATION_OK=1`, and CI workflows must not set that variable.

## Run

```bash
node --experimental-strip-types --experimental-specifier-resolution=node scripts/llm-eval/eval-local-routing.ts
```

Expected: non-zero exit with an ADR-0005 D7 / local-endpoint routing harness message.

```bash
LLM_VALIDATION_OK=1 node --experimental-strip-types --experimental-specifier-resolution=node scripts/llm-eval/eval-local-routing.ts
```

Expected: both harness scenarios pass:

- `visionEnabled=false` plus `requiresVision=true` returns `vision_unavailable_company` before provider selection and makes zero loopback requests.
- `visionEnabled=true` plus `visionConsent=ALWAYS` selects `localOverride`, makes exactly one loopback request, sends a vision-shaped OpenAI-compatible body, and returns the canned loopback response.

## Guardrails

The harness starts its own fake OpenAI-compatible server on `127.0.0.1` and checks `Company.localOverrideConfig.baseUrl` against:

```text
^https?://(127\.0\.0\.1|localhost)(:\d+)?(/|$)
```

The script also installs a fetch guard that fails on any request to `api.openai.com` or any non-loopback host.

To demonstrate the non-loopback failure path:

```bash
LLM_VALIDATION_OK=1 node --experimental-strip-types --experimental-specifier-resolution=node scripts/llm-eval/eval-local-routing.ts --base-url https://example.com/v1
```

Expected: non-zero exit containing `loopback guardrail violated`.

## Evidence

Capture manual run output under `evidence/llm-eval/<date>.md`, including:

- no-env failure output
- success output
- non-loopback failure output
- workflow grep proving `LLM_VALIDATION_OK` is absent from `.github/workflows`
- typecheck or focused syntax validation
- `git diff --check`
