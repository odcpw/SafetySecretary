---
name: case-lab
description: Local SafetySecretaryNext Incident Investigation case replay and evaluation workflow. Use when pulling selected real cases into local Case Lab storage, importing/replaying cases, comparing coach variants, judging investigation quality, updating Case Lab criteria, or explaining Case Lab artifacts. Keep production data local and never commit corpus artifacts.
---

# Case Lab

Use Case Lab as a local-only evaluation subsystem, not as a one-off transcript replay. It has three layers:

1. `operator:export-case` pulls a selected production case into `.tmp/case-corpus*`.
2. `case-lab:import` mirrors the final case into a persistent local `case-lab-source-*` tenant.
3. `case-lab:replay` runs normalized user turns through the current coach into disposable `case-lab-sim-*` tenants and writes artifacts.

## Guardrails

- Keep corpus data and replay artifacts under `.tmp/`; never commit them.
- Prefer `--no-files` unless attachments are needed. Attachment replay is not yet faithful.
- Use `ADMIN_DATABASE_URL` for import, replay, and janitor. Do not run these against production.
- Treat production records as baseline evidence, not ground truth.
- Never judge quality by operation count alone.
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

Replay:

```bash
pnpm flue:build
ADMIN_DATABASE_URL=postgresql://safetysecretary:safetysecretary@localhost:5435/safety_secretary \
  pnpm case-lab:replay -- --import-dir .tmp/case-lab/imports/<import-folder>
```

Re-score without model calls:

```bash
pnpm case-lab:evaluate -- --report .tmp/case-lab/runs/<run-folder>/report.json
```

Clean disposable simulation tenants:

```bash
ADMIN_DATABASE_URL=postgresql://safetysecretary:safetysecretary@localhost:5435/safety_secretary \
  pnpm case-lab:janitor
```

Use `--all` on janitor only when intentionally deleting imported source tenants.

## Evaluation

Read [references/criteria.md](references/criteria.md) before modifying scoring or interpreting non-obvious results.

Current executable criteria live in `scripts/case-lab/evaluator.ts`; tests live in `tests/unit/case-lab/evaluator.test.ts`. When changing criteria:

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
