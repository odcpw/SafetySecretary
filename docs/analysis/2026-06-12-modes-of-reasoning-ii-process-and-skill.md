# Modes of Reasoning Analysis: Incident Investigation Process and Skill

Date: 2026-06-12
Scope: SafetySecretaryNext Incident Investigation (II) process, incident coach skill, and the immediate support surfaces that make the skill safe or unsafe to use.

## Executive Verdict

The II coach is pointed in the right methodological direction. The live skill is not a generic form filler: the prompt frames the assistant as a pragmatic investigator, separates actual harm from credible potential severity, rejects worker-blame causes, drives facts -> causes -> S-T-O-P measures, and keeps operations reviewable before they become the official record.

The risk is enforcement. The strongest investigation rules live in prompt prose and design docs, while phase progression, close/status transitions, operation application, review cards, and tests still accept thinner "shape-correct" records. For an internal pre-release demo this is workable if everyone understands the limitations. It is not ready for real worker injury or company incident data until readiness gates, action linkage, taxonomy alignment, and behavioral tests catch up.

## Ensemble Run

- Spawned 10 Codex sessions in NTM session `ssnext-ii-modes`.
- Used batches after the initial over-dispatch, capped at three newly dispatched panes at a time.
- Read all 10 completed reports from `/tmp/ssnext-ii-modes-JJYLwx`.

Completed mode outputs:

- F5 Root-Cause
- F1 Causal Inference
- G11 Clinical/Operational Diagnostic
- B3 Bayesian
- E1 Belief Revision
- F4 Failure Mode
- G5 Satisficing
- H2 Adversarial Review
- I4 Perspective-Taking
- L2 Debiasing / Epistemic Hygiene

## Findings

### 1. The coach skill itself is a strong base

Evidence: `INCIDENT_COACH_SKILL` is versioned at `0.12.0` and tied to the current prompt in `src/lib/agent/skills/incident-coach-v1.ts:11`. The prompt requires full-story-first capture, real incident time, potential severity, cause-tree discipline, and S-T-O-P actions in `src/lib/incident/coach-prompt.ts:83`, `src/lib/incident/coach-prompt.ts:106`, and `src/lib/incident/coach-prompt.ts:126`.

Reasoning-mode consensus: F5, F1, E1, G5, and I4 all agreed that the core method is coherent. The next step is not a prompt rewrite. The next step is making the existing prompt contract executable and testable.

Action: Treat the prompt's anti-blame, potential-severity, full-story, and close protocol rules as acceptance criteria.

### 2. Phase and close readiness are too count-driven

Evidence: `buildPhaseSignal` uses fact/timeline counts, cause count, and measure count to derive facts/causes/measures. It can suggest moving to measures while open branches exist in `src/lib/incident/cause-tree.ts:280` and `src/lib/incident/cause-tree.ts:321`. Separately, `applyWorkflowAction` allows any open register state to close in `src/lib/incident/workflow-stage.ts:145`, and the status route persists that transition without loading readiness evidence in `src/app/api/incidents/[id]/status/route.ts:48`.

Why it matters: A manager can produce a record with enough items to look progressed without resolving credible worst case, serious-potential depth, open branches, owner/due dates, or safety-critical unknowns. The coach prompt says not to close that way, but the lifecycle path can bypass the coach.

Action: Add a shared `incidentReadiness` or `investigationPosture` builder used by the coach context, readiness UI, close/status route, and tests. Keep draft capture flexible, but make official close/export/approval explicit about blockers and overrides.

### 3. Potential severity is canonical but not a lifecycle invariant

Evidence: The full create path rejects missing potential severity in `src/app/api/incidents/route.ts:526`, and the owner-canonical methodology requires it for every `IncidentCase`, including property damage. But chat-first draft creation sets `potentialSeverityCode: null` in `src/app/api/incidents/route.ts:233`, PATCH can clear the pair in `src/app/api/incidents/[id]/route.ts:485`, and the overview editor exposes a blank option.

Why it matters: This is the field that drives SIF/pSIF-style depth. Letting it remain blank through close/export turns "capture is incomplete" into "official investigation is incomplete" without a strong boundary.

Action: Preserve nullable draft capture. Block or explicitly override close/export/approval when potential severity is missing, and surface that state as method-critical rather than a passive badge.

### 4. S-T-O-P actions can lose their causal attachment

Evidence: The prompt requires `linkedCauseNodeId` for `stop_action` in `src/lib/incident/coach-prompt.ts:145`. The apply path resolves it, but falls back to the first cause when the model omits a link in `src/lib/agent/incident-investigation/apply-operation.ts:243`. Review-card editing is a single text area in `src/components/incident/coach/CoachWorkbench.tsx:620`, and the `stop_action` summary shows title/class/purpose but not linked cause, owner, or due date in `src/components/incident/coach/CoachWorkbench.tsx:729`.

Why it matters: Cause-to-action linkage is not metadata. It is the prevention logic. A plausible action attached to the wrong branch makes the investigation look more disciplined than it is.

Action: For coach-generated actions, reject missing cause links or require the reviewer to choose a cause before apply. Show linked cause, owner, due date, S/T/O/P class, and purpose on the card. Disable bulk accept for high-impact mixed bundles.

### 5. The v0.12 event taxonomy is split across layers

Evidence: The prompt and apply path accept `CUT_PUNCTURE`, `CONTACT_HOT_COLD`, `ELECTRICITY`, and `HARMFUL_EXPOSURE` in `src/lib/incident/coach-prompt.ts:137` and `src/lib/agent/incident-investigation/apply-operation.ts:359`. The create/PATCH route validators still use the older event-type set in `src/app/api/incidents/route.ts:117` and `src/app/api/incidents/[id]/route.ts:114`. The SQL check constraint also uses the older set in `db/sql/00200_incident_case.sql:271` and `db/sql/00200_incident_case.sql:640`.

Why it matters: The coach can propose common accident-mechanism values that the official record path cannot persist. This is a concrete cross-layer contract bug, not just methodology.

Action: Centralize the event-type code list, update route validators and DB constraints, and add a persistence test for every coach-advertised event type.

### 6. Tests prove plumbing more than investigation behavior

Evidence: `tests/unit/agent/incident-coach-skill.test.ts:34` pins prompt sections/version/operation docs. `tests/integration/incidents/coach-chat.test.ts:131` verifies a deterministic fixture can parse and apply operations. That fixture proposes a cause, action, and root mark while still asking for credible worst case in `tests/fixtures/llm/ii-coach-chat.json:4`.

Why it matters: The tests can pass while the coach overreaches from thin input, accepts blame framing, moves to measures too early, or closes with unresolved serious-potential questions.

Action: Add a small behavior fixture pack: thin first input, contradiction, worker-blame bait, serious-potential near miss, PPE-only weak action, user pushing to close with open branches, and missing linked action cause.

### 7. The manager-facing workflow still exposes specialist structure too early

Evidence: I4 flagged a mismatch between the product goal of a practical manager workflow and the visible "Cause tree" surface. The current workbench exposes tree concepts such as root, park, move-under, and branch status through `RecordPanel` and `CauseTreeEditor`, while the flow-review direction asks for simple cause-card defaults and deeper tree as an advanced view.

Why it matters: A safety specialist may appreciate the tree. A line manager handling a fresh incident needs "what happened, why, what changes" first. Overexposing tree mechanics can reduce adoption and make "root cause" feel like blame assignment.

Action: Keep the cause tree internally. Default to simpler cause cards with "still checking / confirmed / outside our control" language, and expose tree controls as a detailed mode.

### 8. Worker/witness provenance is valued but awkward to create from chat

Evidence: The prompt asks for source attribution, and context loads people/accounts/facts. But applying a `fact` requires a resolvable source account and returns `PERSON_ACCOUNT_REQUIRED` otherwise in `src/lib/agent/incident-investigation/apply-operation.ts:63`. The coach operation set does not create people/accounts.

Why it matters: The system protects provenance, which is good. But a manager pasting a witness statement before creating a person/account can hit friction at the exact moment the product should preserve voice and attribution.

Action: Add a guided statement-intake path or reviewable "create account from this statement" proposal, still human-reviewed.

### 9. Incident time note handling has a concrete lower-priority bug

Evidence: The overview payload sends `incident.incidentTimeNote` as `incidentTimeZone` in `src/components/incident/coach/OverviewEditor.tsx:465`. The API parses `incidentTimeZone` as a time zone in `src/app/api/incidents/[id]/route.ts:458`, then writes `payload.incidentTimeZone` into `incident_time_note` in `src/app/api/incidents/[id]/route.ts:327`.

Why it matters: The prompt treats real incident time and approximate time notes as first-class investigation facts. This mismatch can overwrite a note with a time zone value or lose the note through ordinary overview edits.

Action: Split `incidentTimeZone` and `incidentTimeNote` in the payload/API path, then add a regression test for preserving an approximate time note.

### 10. Adversarial inputs and expected-vs-actual deviation need clearer structure

Evidence: H2 flagged that the coach prompt includes raw conversation and raw user message text in `src/lib/incident/coach-prompt.ts:177`, and photo analysis includes uploaded filenames in the vision prompt. It also noted that the methodology and database contain an expected-vs-actual deviation concept, but the live coach context and operation set do not expose a deviation operation in `src/lib/agent/skills/incident-coach-v1.ts:17`.

Why it matters: The application constrains mutations through reviewable operations, so this is not a direct silent-write problem. The adversarial risk is reasoning capture: injected user text, transcript text, or filenames can make the coach skip questions or sound falsely certain. Separately, without an explicit "what should have happened / what happened instead" spine, the coach can jump from narrative facts to cause labels too quickly.

Action: Wrap untrusted transcript/user/filename content as clearly untrusted data, sanitize or omit original filenames in model prompts, and add a lightweight deviation operation/card before cause branching.

## Verification

Commands run:

- `pnpm test:agent`
  - Result: pass, 29 tests passed, 0 failed, 0 skipped.
  - Notes: Node `MODULE_TYPELESS_PACKAGE_JSON` warnings only.

- `pnpm test:incidents:status`
  - Result: 6 passed, 0 failed, 1 skipped.
  - Skip reason: DB-backed II status integration skipped because `DATABASE_URL` is required.

Direct source checks verified:

- Count-based phase signal and measures/close hints.
- Close transition route without method-readiness loading.
- Potential-severity draft/edit/validation split.
- Stop-action first-cause fallback and compact review-card UI.
- Event-type prompt/apply vs route/SQL drift.
- Incident time note/timezone mismatch.
- Untrusted prompt-data boundaries and missing deviation operation, from H2 plus spot checks.

## Recommended Next 30 Days

P0: Add `incidentReadiness` / `investigationPosture`.
Effort: medium. Benefit: high. Inputs should include potential severity, incident time state, serious potential, unresolved safety-critical unknowns, cause-branch state, action links, owner/due dates, and HIRA follow-up expectation.

P0: Harden `stop_action` application and cards.
Effort: low to medium. Benefit: high. Reject missing cause links from coach operations or require explicit reviewer resolution. Show the causal target before accept.

P1: Align event taxonomy.
Effort: low to medium. Benefit: high. One source of truth for prompt, labels, validators, SQL, and tests.

P1: Add behavior fixtures/evals.
Effort: medium. Benefit: high. These should test investigation judgment, not only JSON shape.

P2: Gate close/export/approval on official readiness.
Effort: medium. Benefit: high. Start as blocking errors plus explicit overrides for internal demo, then tighten before real data.

P2: Make the default cause UI less specialist-facing.
Effort: medium. Benefit: medium. Simple cause cards first, tree controls second.

P3: Fix incident time note handling.
Effort: low. Benefit: medium. It is concrete and easy to regress-test.

P3: Add untrusted-data boundaries and a lightweight deviation card.
Effort: medium. Benefit: medium. This reduces prompt-injection reasoning capture and gives the coach a stronger expected-vs-actual bridge before cause labels.

P4: Mark old v0 docs as historical or publish a current v0.12 contract.
Effort: low. Benefit: medium for future agents and reviewers.

## Open Questions

- Should close be hard-blocked on missing potential severity in demo mode, or warning-only with explicit override?
- What is the minimum acceptable branch depth for A/B serious-potential near misses?
- Should `Accept all` exist for bundles containing causes, root/park updates, or S-T-O-P actions?
- Should the coach be allowed to propose person/account creation, or should statement provenance stay manual?
- Is the intended default manager-facing surface "cause cards", with tree detail only for specialists?

## Confidence

Overall confidence: 0.85.

The strongest findings are direct code-contract issues: event-type drift, stop-action fallback, count-based phase hints, permissive close, and potential-severity lifecycle drift. Confidence is lower on adoption impact because this pass did not include live user testing or browser reproduction. Severity is calibrated to the stated internal-demo/pre-release context; several medium findings become high before real worker injury/company data is used.
