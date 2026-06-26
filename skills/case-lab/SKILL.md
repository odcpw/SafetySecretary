---
name: case-lab
description: Local SafetySecretaryNext Incident Investigation case replay and evaluation workflow. Use when pulling selected real cases into local Case Lab storage, importing/replaying cases, comparing coach variants, judging investigation quality, updating Case Lab criteria, or explaining Case Lab artifacts. Keep production data local and never commit corpus artifacts.
---

# Case Lab

Use Case Lab as a local-only case-study replay subsystem, not as transcript replay. The Actual Case is the canonical extracted benchmark: narrative, facts, classification, causes, actual measures, uncertainties, and evidence references. A case study wraps that Actual Case for adaptive replay. The goal is to compare which coach skills/prompts/runtimes reconstruct and improve the real case investigation outcome.

The primary subject under test is the Flue incident investigation agent: Flue
agent instructions, the incident-investigation skill, typed tools, record
digests, validation feedback, and backend safety rails. Do not reduce variant
work to prompt wording alone.

1. `operator:export-case` pulls a selected production case into `.tmp/case-corpus*`.
2. `case-lab:import` mirrors the final case into a persistent local `case-lab-source-*` tenant for inspection.
3. `case-lab:study` builds `actual-case.json` plus a reusable `case-study.json` wrapper from the exported case.
4. `case-lab:replay` plays that Actual Case through a coach skill/runtime using an adaptive simulated user.

## Guardrails

- Keep corpus data and replay artifacts under `.tmp/`; never commit them.
- Prefer `--no-files` unless attachments are needed. Attachment replay is not yet faithful.
- Use `ADMIN_DATABASE_URL` for import, replay, and janitor. Do not run these against production.
- Treat production records as baseline evidence, not ground truth.
- Never compare different cases with one case's rubric.
- Never judge quality by operation count or transcript similarity alone.
- Hard-fail fatality severity mismatches, failed operation application, schema/provisioning failures, tenant leaks, and unsafe data export surfaces.

## Workflow

Export one selected case:

```bash
pnpm operator:export-case -- --tenant <tenant> --case-number <case> --no-files --out-dir .tmp/case-corpus
```

Import locally:

```bash
ADMIN_DATABASE_URL=postgresql://safetysecretary:safetysecretary@localhost:5435/safety_secretary \
  pnpm case-lab:import -- --case-folder .tmp/case-corpus/<case-folder>
```

Build the Actual Case and case study:

```bash
pnpm case-lab:study -- --case-folder .tmp/case-corpus/<case-folder>
```

Replay the study adaptively:

```bash
pnpm flue:build
ADMIN_DATABASE_URL=postgresql://safetysecretary:safetysecretary@localhost:5435/safety_secretary \
  pnpm case-lab:replay -- --study .tmp/case-lab/studies/<study-folder>/case-study.json --variant <skill-or-prompt-name>
```

Re-score without model calls:

```bash
pnpm case-lab:evaluate -- --report .tmp/case-lab/study-runs/<run-folder>/report.json
```

Clean disposable simulation tenants:

```bash
ADMIN_DATABASE_URL=postgresql://safetysecretary:safetysecretary@localhost:5435/safety_secretary \
  pnpm case-lab:janitor
```

Use `--all` on janitor only when intentionally deleting imported source tenants.

## Evaluation

Read [references/criteria.md](references/criteria.md) before modifying scoring or interpreting non-obvious results.

Current case-study criteria live in `scripts/case-lab/case-study.ts`; focused tests live in `tests/unit/case-lab/case-study.test.ts`. When changing criteria:

- update `CASE_LAB_CRITERIA_VERSION`;
- add or update focused tests;
- re-score saved reports with `case-lab:evaluate`;
- update `docs/dev/case-lab.md` if operator behavior changes.

## Verification

Run the focused gates after Case Lab edits:

```bash
pnpm test:case-lab
pnpm typecheck
node --check scripts/operator/export-incident-case-corpus.mjs
```

Run a real replay only when changing coach behavior or replay mechanics; it costs model/runtime work.
