# Pass 6 Ledger

## Candidate

| Candidate | Scope | LOC | Confidence | Risk | Score | Decision |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Document `AgentFakeTransport` boundary | `src/lib/agent/fake-transport.ts` exported synthetic runtime helper | 1 | 5 | 1 | 5.0 | Shipped |

## Change

Added a module-level comment to `src/lib/agent/fake-transport.ts` clarifying that the fake transport is deterministic infrastructure for tests and manual validation harnesses. This keeps the existing export usable by real runtime-path tests while making the synthetic contract explicit at the product-source boundary.

## LOC Delta

From `git diff --numstat` before artifact/progress updates:

| File | Added | Deleted | Net |
| --- | ---: | ---: | ---: |
| `src/lib/agent/fake-transport.ts` | 7 | 0 | +7 |

## Rejections / Already Correct

| Area | Decision | Reason |
| --- | --- | --- |
| `scripts/agent-runtime/validate-agent-runtime.ts` fake labels | Leave | Harness already says manual, gated, synthetic-only, and no secrets; changing labels would alter evidence payloads without reducing residue. |
| `src/lib/llm/mock.ts` | Leave | `MockProvider` is intentional test provider infrastructure, with loud unknowns and guardrail references. |
| `tests/unit/llm/mock.test.ts` | Leave | Synthetic image and mock prompt labels are explicitly test inputs. |
| `tests/unit/agent/*` synthetic data | Leave | Synthetic names are fixture data for runtime/tool-contract tests. |
| `scripts/dev/seed-demo-incident.ts` | Leave | Demo naming is accurate and isolated to dev bootstrap. |
| `tests/integration/exports/route-stubs/*` | Leave | Route stubs are legitimate integration-test replacements used to capture export calls. |

## Verdict

PRODUCTIVE
