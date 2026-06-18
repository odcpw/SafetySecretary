# Pass 01 Baseline

Generated: 2026-06-18
Scope: `/home/oliver/Projects/odcpw/SafetySecretaryNext`
Baseline HEAD: `ae1989e`
Mission: baseline evidence, clone/slop discovery, first-pass candidate ranking

## Repo state before artifact writes

- `git status --short` -> clean output
- `git diff --stat` -> clean output
- No production-code edits were required to run the requested baselines.

## Required baseline commands

| Command | Result | Evidence |
|---|---|---|
| `git status --short` | PASS | no output |
| `git diff --stat` | PASS | no output |
| `pnpm test:auth:last-user` | PASS with expected skip | `tests 37`, `pass 36`, `fail 0`, `skipped 1`; skip reason: `DATABASE_URL is required` in `last-user policy integration` |
| `pnpm test:incidents:coach-flue` | PASS | `tests 23`, `pass 23`, `fail 0`, `skipped 0` |
| `pnpm typecheck` | PASS | `tsc --noEmit`; clean exit, no diagnostics |

## Baseline warnings and caveats

- Both focused test commands emit repeated Node `MODULE_TYPELESS_PACKAGE_JSON` warnings. They are pre-existing noise, not failures.
- `pnpm test:incidents:coach-flue` also emits Node's experimental SQLite warning in the sqlite migration/pruner tests.
- The auth suite's single skip is environment-gated, not code-failure-driven.

## Discovery tools and environment status

| Command | Result | Exact output / note |
|---|---|---|
| `jscpd --version` | SKIP | `/bin/bash: line 1: jscpd: command not found` |
| `command -v scc` | SKIP | no output; `scc` not installed |
| `bash /home/oliver/.agents/skills/simplify-and-refactor-code-isomorphically/scripts/dup_scan.sh 20260618-simplify-loop/pass-01 src` | PASS with empty tool inventory | `tools that ran: (none)`; wrote placeholder `duplication_map.{md,json}` |
| `bash /home/oliver/.agents/skills/simplify-and-refactor-code-isomorphically/scripts/ai_slop_detector.sh src 20260618-simplify-loop/pass-01` | PASS with false-negative risk | wrote `slop_scan.md`; see note below about `rg` type compatibility |
| ad hoc `rg ... --type ts --type tsx` | SKIP | `rg: unrecognized file type: tsx` |

### Scanner trust note

The installed `rg` rejects `--type tsx`, but the skill's `ai_slop_detector.sh` suppresses stderr inside many captures. That means TS/TSX-heavy sections showing `_none found_` in `slop_scan.md` cannot be treated as proof of absence. Manual fallback scans with `-g '*.ts' -g '*.tsx'` were required for candidate discovery.

## High-signal discovery artifacts

- `refactor/artifacts/20260618-simplify-loop/pass-01/slop_scan.md`
- `refactor/artifacts/20260618-simplify-loop/pass-01/duplication_map.md`
- `refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md`
- `refactor/artifacts/20260618-simplify-loop/pass-01/census_causeMethodLabel.md`
- `refactor/artifacts/20260618-simplify-loop/pass-01/census_proposalResult.md`

## Focus-area observations

### Auth / invite / workspace

- `src/lib/email/transport.ts` contains three provider classes with paired `sendMagicLink` / `sendInvitation` methods that differ mostly by payload field names and subject/body helpers.
- `src/lib/auth/csrf-client.ts` already centralizes client-side CSRF cookie reads, but multiple auth- and workspace-adjacent UI files still inline local copies of `ensureCsrfToken` / `readCookie`.
- `src/lib/auth/invitations.ts` and `src/lib/auth/magic-link.ts` contain similar invitation acceptance shapes, but they sit on different auth invariants and should not be collapsed casually.

### Flue / incident coach / agent

- `src/lib/incident/coach-flue-operation-tools.ts` has four builder entrypoints sharing `errors` / `operations` accumulation and `proposalResult(...)` exit shape; this is a real simplification surface but inside a validation-heavy boundary.
- `src/components/incident/coach/CoachWorkbench.tsx`, `src/lib/incident/coach-chat.ts`, and `src/lib/incident/coach-proposal-digest.ts` repeat payload-cast-and-gist extraction logic.
- Locale-base derivation (`locale.split("-")[0]?.toLowerCase() ?? "en"`) repeats across coach UI and incident helpers.

### Shared UI

- `ensureCsrfToken` callsites span 30 source files, but the real simplification target is narrower: local helper copies still present in a small set of client components/pages.
- `src/components/incident/coach/CoachWorkbench.tsx` is an "everything hook" hotspot by the slop scan, but this pass did not justify broad decomposition without stronger behavioral proof.

## Largest in-scope files from targeted scan

| Lines | File |
|---:|---|
| 1632 | `src/components/incident/coach/CoachWorkbench.tsx` |
| 1057 | `src/lib/agent/incident-investigation/apply-operation.ts` |
| 1056 | `src/components/incident/coach/CauseTreeEditor.tsx` |
| 873 | `src/lib/incident/coach-chat.ts` |
| 803 | `src/lib/incident/coach-flue-operation-tools.ts` |
| 678 | `src/lib/auth/invitations.ts` |
| 610 | `src/lib/auth/magic-link.ts` |

## Pass/Fail/Skip summary for requested commands

- Required commands: `5 pass`, `0 fail`, `0 skip`
- Discovery/tooling checks: `3 pass`, `0 fail`, `3 skip`
- Total recorded commands in this artifact: `8 pass`, `0 fail`, `3 skip`
