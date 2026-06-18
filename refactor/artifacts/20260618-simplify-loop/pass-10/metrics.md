# Pass 10 Metrics

Generated: 2026-06-18T21:34:21+02:00
Baseline commit: `c7a0a98`
Compared revision: `d595c74` (`HEAD` before unstaged pass-10 artifacts)

## Method

Command:

```text
git diff --numstat c7a0a98..HEAD
```

Categorization:

- `source`: any changed file outside `tests/**`, `refactor/artifacts/**`, and `.skill-loop-progress.md`; this includes `src/**`, `.flue/**`, and `scripts/**`.
- `test`: `tests/**`.
- `artifact`: `refactor/artifacts/**`.
- `progress`: `.skill-loop-progress.md`.

Pass-10 artifact/progress edits are intentionally excluded from this baseline-to-HEAD source delta because the user requested no commit.

## Category Delta

| Category | Files | Added | Deleted | Net |
|---|---:|---:|---:|---:|
| Source | 15 | 200 | 193 | +7 |
| Test | 4 | 199 | 5 | +194 |
| Artifact | 33 | 1737 | 0 | +1737 |
| Progress | 1 | 131 | 0 | +131 |
| Total | 53 | 2267 | 198 | +2069 |

## Source Delta By File

| File | Added | Deleted | Net |
|---|---:|---:|---:|
| `.flue/agents/incident-investigation.ts` | 2 | 1 | +1 |
| `scripts/agent-runtime/run-flue-incident-story.ts` | 4 | 1 | +3 |
| `src/app/invite/[token]/page.tsx` | 6 | 54 | -48 |
| `src/components/agent/StructuredOperationReview.tsx` | 29 | 30 | -1 |
| `src/lib/agent/fake-transport.ts` | 7 | 0 | +7 |
| `src/lib/auth/cookies.ts` | 27 | 2 | +25 |
| `src/lib/auth/csrf.ts` | 22 | 2 | +20 |
| `src/lib/email/transport.ts` | 65 | 92 | -27 |
| `src/lib/i18n/messages.de.json` | 0 | 1 | -1 |
| `src/lib/i18n/messages.en.json` | 0 | 1 | -1 |
| `src/lib/i18n/messages.fr.json` | 0 | 1 | -1 |
| `src/lib/i18n/messages.it.json` | 0 | 1 | -1 |
| `src/lib/i18n/types.ts` | 0 | 1 | -1 |
| `src/lib/incident/coach-flue-config.ts` | 8 | 0 | +8 |
| `src/lib/incident/coach-flue-operation-tools.ts` | 30 | 6 | +24 |
| **Source total** | **200** | **193** | **+7** |

## Interpretation

- Production source is effectively flat at net `+7` lines across the committed loop.
- The largest source shrink was invite session-cookie duplication (`-48`) and email transport duplication (`-27`).
- Positive source deltas mostly come from making shared auth/Flue/type boundaries explicit and documented.
- Test code grew by `+194` lines to prove provider wire formats, cookie security context, Flue model resolution, and operation validation behavior.
- Artifacts and progress files intentionally dominate the total diff because this loop emphasized durable proof.
