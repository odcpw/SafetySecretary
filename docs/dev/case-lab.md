# Case Lab

Case Lab is the local experimentation harness for Incident Investigation coach
quality. It replays case studies, not old chat transcripts. It keeps five
things separate:

- **Corpus export**: immutable evidence pulled from a selected real case.
- **Lab import**: a local tenant that mirrors the exported final case for
  inspection and regression fixture work.
- **Actual Case**: the canonical extracted benchmark from the history: case
  narrative, facts, expected classification, causes, actual measures,
  uncertainties, and evidence references.
- **Case study**: a replay wrapper around the Actual Case.
- **Study run**: a fresh local tenant/case where an adaptive simulated user
  answers from the Actual Case while a coach skill/runtime investigates.

This is intentionally command-line and artifact-first. A UI or optimization
loop can sit on top later.

The primary quality question is whether the coach helps turn surfaced facts
into causal conditions, then into pragmatic measures a manager can implement
and follow up. Severity and classification matter, especially for dangerous
misclassification, but they are supporting invariants inside that investigation
chain rather than the center of the lab.

## Subsystem Layout

- `scripts/operator/export-incident-case-corpus.mjs`: read-only selected-case
  exporter.
- `scripts/case-lab/case-lab.ts`: Case Lab CLI orchestration.
- `scripts/case-lab/case-study.ts`: Actual Case extractor, case-study builder,
  adaptive simulator, and per-study evaluator.
- `tests/unit/case-lab/case-study.test.ts`: focused case-study tests.
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

Import the exported final state into a local lab tenant:

```bash
ADMIN_DATABASE_URL=postgresql://safetysecretary:safetysecretary@localhost:5435/safety_secretary \
  pnpm case-lab:import -- --case-folder .tmp/case-corpus-full/<case-folder>
```

Build the Actual Case and reusable study:

```bash
pnpm case-lab:study -- --case-folder .tmp/case-corpus-full/<case-folder>
```

Replay the study adaptively into a fresh simulation tenant through Flue:

```bash
pnpm flue:build
ADMIN_DATABASE_URL=postgresql://safetysecretary:safetysecretary@localhost:5435/safety_secretary \
  pnpm case-lab:replay -- --study .tmp/case-lab/studies/<study-folder>/case-study.json --variant current
```

The simulation seed is cold: it does not copy source facts into the new case.
The coach has to surface the narrative by asking useful questions. The
simulated user only answers from the Actual Case embedded in the study.

Re-score an existing replay report:

```bash
pnpm case-lab:evaluate -- --report .tmp/case-lab/study-runs/<run-folder>/report.json
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

`case-lab:study` writes:

- `actual-case.json`
- `actual-case.md`
- `case-study.json`
- `case-study.md`

`case-lab:replay` writes:

- `report.json`
- `evaluation.json`
- `evaluation.md`
- `flue.db`
- `flue-server.log`

The replay tenant is dropped after the run. The imported lab tenant persists so
the source case can be inspected locally.

## Evaluator Method

The case-study evaluator is a weighted rubric against the Actual Case, not an
operation-count or transcript-similarity check. Counts are useful diagnostics,
but they are not the quality target.

The current executable criteria version is emitted in every `evaluation.json`
and `evaluation.md`.

Current case-study categories:

- `classification`: incident type, outcome, hazard, event type, and potential
  severity match the Actual Case logic.
- `fact_capture`: required Actual Case facts appear in the final record.
- `questioning`: important facts were surfaced by relevant coach questions.
- `investigation_logic`: Actual Case causes appear in the record.
- `measures`: Actual Case measures appear when the study reaches measures.
- `case_chain`: facts lead to captured causes, and causes lead to linked,
  implementable measures.
- `operation_safety`: the coach does not fabricate actions, hide measures in
  fact rows, or invent owners/due dates.
- `agent_reasoning`: fatal-potential severity was proposed correctly by the
  coach itself, not only rescued by backend guards.
- `runtime`: the study run completed and produced a usable artifact.

For high-potential chemical exposures, the important severity criterion is
consistency: if the potential outcome text says fatal, death, killed, or
lethal, severity must be `A`. Serious, toxic, poisoning, irreversible, or
respiratory harm without fatal wording must still be defensible as `A` or `B`.
Fatality severity mismatch is a hard failure and cannot be averaged away by
other passing checks. Non-fatal severity drift is a weighted classification
failure, not automatically a critical hard failure. Avoid treating "not equal
to production" as a pass.

Do not compare unrelated cases with one Actual Case rubric. A Fräsmaschine finger
amputation case is scored against mechanical/amputation expectations. An HCN
near miss is scored against hazardous-substance/fatal-exposure expectations.
Shared code handles invariants and study mechanics; case-specific expectations
come from the Actual Case.

## Optimization Loop

Use the imported case as a fixed corpus item, then run multiple replay variants
against fresh simulation tenants. Variants can change the Flue agent
instructions, the investigation skill, tool descriptions, record digests, Flue
model, runtime wiring, fallback prompt, or evaluator model without mutating the
source tenant.

The default target is the Flue incident investigation agent described in
`docs/dev/incident-investigation-agent.md`. Case Lab should judge whether that
agent uncovers and structures the Actual Case well, not whether a transcript
resembles an old conversation or whether a single prompt sounds plausible.

For comparison:

- Treat broken schema, failed operation application, tenant leaks, or unsafe
  export surfaces as invalid runs. These are operator/runtime defects that may
  abort before the weighted evaluator can score.
- Hard-fail fatal-potential severity mismatches in `evaluation.json`.
- Score investigation quality with the rubric: facts, timeline, severity,
  causal logic, fact-to-cause-to-measure chain, next question, operation safety,
  coach reasoning before guards, and method-switch behavior.
- Compare artifact directories, not chat transcripts alone. `report.json`
  contains the normalized turns, assistant messages, operations, applied
  records, final case state, progress events, and Flue SQLite trace.
- Keep action counts as diagnostics only. More operations are not better unless
  they improve the case record. A vague, unlinked, ownerless, or timeless action
  is weak even when it increases the count.

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
