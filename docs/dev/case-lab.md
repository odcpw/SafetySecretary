# Case Lab

Case Lab is the local experimentation harness for Incident Investigation coach
quality. It keeps three things separate:

- **Corpus export**: immutable evidence pulled from a selected real case.
- **Lab import**: a local tenant that mirrors the exported final case for
  inspection and regression fixture work.
- **Simulation run**: a fresh local tenant/case that replays the normalized user
  conversation through the current coach path and captures trace artifacts.

This is intentionally command-line and artifact-first. A UI or optimization
loop can sit on top later.

## Subsystem Layout

- `scripts/operator/export-incident-case-corpus.mjs`: read-only selected-case
  exporter.
- `scripts/case-lab/case-lab.ts`: Case Lab CLI orchestration.
- `scripts/case-lab/evaluator.ts`: executable criteria and scorecard
  generation.
- `tests/unit/case-lab/evaluator.test.ts`: focused criteria tests.
- `skills/case-lab/SKILL.md`: agent-facing operating procedure for this
  subsystem.
- `skills/case-lab/references/criteria.md`: criteria reference for future
  agents.

Corpus data, imported manifests, replay reports, Flue logs, and Flue SQLite
files stay under `.tmp/` and are not committed.

## Commands

Start from an exported case folder:

```bash
pnpm operator:export-case -- --tenant siegfried.ch --case-number II-2026-001 --no-files --out-dir .tmp/case-corpus
```

Use `--full-flue-stream` or omit `--no-files` only when that evidence is needed
for the specific evaluation. Normal prompt/tool evaluation should not pull file
bodies.

Import the exported final state into a local lab tenant and normalize the user
turns:

```bash
ADMIN_DATABASE_URL=postgresql://safetysecretary:safetysecretary@localhost:5435/safety_secretary \
  pnpm case-lab:import -- --case-folder .tmp/case-corpus-full/<case-folder>
```

Replay the normalized turns into a fresh simulation tenant through Flue:

```bash
pnpm flue:build
ADMIN_DATABASE_URL=postgresql://safetysecretary:safetysecretary@localhost:5435/safety_secretary \
  pnpm case-lab:replay -- --import-dir .tmp/case-lab/imports/<import-folder>
```

Replay is cold by default: the simulation seed does not copy the source
incident date/time, so the coach has to recover timing from the conversation.
Use `--warm-start` only when intentionally testing from a prefilled record.

Re-score an existing replay report:

```bash
pnpm case-lab:evaluate -- --report .tmp/case-lab/runs/<run-folder>/report.json
```

Clean leftover lab tenants:

```bash
ADMIN_DATABASE_URL=postgresql://safetysecretary:safetysecretary@localhost:5435/safety_secretary \
  pnpm case-lab:janitor
```

By default, janitor only drops leftover `case-lab-sim-*` tenants. Add `--all`
when you intentionally want to remove imported `case-lab-source-*` tenants too.

## Artifact Layout

`case-lab:import` writes:

- `case-lab-manifest.json`
- `normalized-conversation.json`

`case-lab:replay` writes:

- `report.json`
- `evaluation.json`
- `evaluation.md`
- `flue.db`
- `flue-server.log`

The replay tenant is dropped after the run. The imported lab tenant persists so
the source case can be inspected locally.

## Evaluator Method

The evaluator is a weighted rubric, not an operation-count check. Counts are
useful diagnostics, but they are not the quality target.

The current executable criteria version is emitted in every `evaluation.json`
and `evaluation.md`.

Current categories:

- `fact_capture`: essential facts from the user account were retained.
- `timeline_quality`: user-provided dates land in the main incident date, not
  only in narrative timeline rows.
- `classification`: incident type, outcome, hazard, event type, and potential
  severity are coherent with the case facts.
- `investigation_logic`: causes are framed as conditions, branches remain open
  when the investigation is incomplete, and the cause structure follows the
  actual case logic.
- `next_question`: the assistant asks a case-progressing next question.
- `operation_safety`: the assistant does not fabricate timestamps or measures.
- `method_switch`: UI-driven method switch turns do not mutate the record and
  the final method matches the last switch.

For high-potential chemical exposures, the important severity criterion is
consistency: if the potential outcome text says fatal, death, killed, or
lethal, severity must be `A`. Serious, toxic, poisoning, irreversible, or
respiratory harm without fatal wording must still be defensible as `A` or `B`.
Fatality severity mismatch is a hard failure and cannot be averaged away by
other passing checks. Avoid treating "not equal to production" as a pass.

Known limitation: `case-lab-criteria-v0.1.0` still contains HCN/Siegfried
specific checks. Before broad optimization, move case-specific requirements
into per-case expectation files and keep shared code focused on invariants.

## Optimization Loop

Use the imported case as a fixed corpus item, then run multiple replay variants
against fresh simulation tenants. Variants can change the coach prompt, Flue
model, runtime wiring, or evaluator model without mutating the source tenant.

For comparison:

- Hard-fail broken schema, failed operation application, tenant leaks, or
  dangerous classification contradictions.
- Score investigation quality with the rubric: facts, timeline, severity,
  causal logic, next question, operation safety, and method-switch behavior.
- Compare artifact directories, not chat transcripts alone. `report.json`
  contains the normalized turns, assistant messages, operations, applied
  records, final case state, progress events, and Flue SQLite trace.
- Keep action counts as diagnostics only. More operations are not better unless
  they improve the case record.

Codex CLI/OAuth can be added as a separate evaluator or simulator lane by
running `codex exec` over the Case Lab artifacts. Keep that outside the
application request path: Codex credentials belong to trusted local/CI
automation, not normal tenant runtime credentials.

## Codex OAuth Boundary

Codex CLI/OAuth is useful as an external simulation or evaluator lane: a local
or CI runner can invoke Codex as a separate process to judge artifacts or drive
experiments.

Do not treat Codex OAuth/access tokens as a drop-in app/server credential for
the SafetySecretary LLM provider. The application provider chain is currently
OpenAI-compatible API based:

- local override
- tenant BYOK
- self-hosted OpenAI-compatible endpoint
- hosted OpenAI with `OPENAI_API_KEY`

For app/runtime calls, use `OPENAI_API_KEY`, tenant BYOK, a local
OpenAI-compatible endpoint, or a future official workload-identity style token
provider if implemented deliberately. Keep Codex CLI credentials isolated from
normal app/server credential surfaces.

## Non-Goals

- Do not use Flue event stream deltas as the primary product-learning corpus.
  They are runtime traces; accepted app records and coach messages are the
  durable learning substrate.
- Do not hard-gate every subjective evaluator finding. Hard-gate schema/apply
  failures and obvious dangerous contradictions; score the rest.
- Do not import attachments across tenants until storage key re-mapping and
  file-copy semantics are implemented explicitly.

## Verification

Run focused checks after Case Lab code, criteria, or exporter changes:

```bash
pnpm test:case-lab
pnpm typecheck
node --check scripts/operator/export-incident-case-corpus.mjs
```

Re-run `case-lab:evaluate` on saved reports whenever criteria change. Re-run
`case-lab:replay` only when coach behavior or replay mechanics changed.
