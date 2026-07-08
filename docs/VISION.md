# Safety Secretary — Product Vision

_Last reworked: 2026-07-08. This document is authoritative for product direction
in this repository. If another doc contradicts it, this one wins._

## What we build

Coaches, not forms. Each module is **one person, one conversation, one
artifact**: a frontline manager talks through their work in normal words, an
agent asks the right next questions, and a complete, structured document fills
in behind the conversation. Nothing enters the record until the person accepts
it.

We are **not** building an EHS suite. Modules are independent by design and are
shipped one at a time in the simplest shape that helps one person produce one
good document. Anything that ties modules together is deferred until the
modules themselves are good.

## The shared grammar

Every module uses the same interaction pattern, so a user learns the product
once:

1. **Talk.** Describe the situation in plain language — type, dictate, paste,
   or attach photos.
2. **Be coached.** The agent asks targeted follow-up questions, phase by phase.
   It probes; it does not interrogate. It never blames.
3. **Accept.** The agent proposes structured changes as reviewable cards. The
   human accepts, edits, or dismisses each one. Nothing lands otherwise.
4. **See the record fill.** An editable workbench shows the growing document
   next to the chat. Everything the coach writes can be edited by hand.
5. **Export and approve.** One click produces the paperwork. Approval creates
   an immutable snapshot.

Supporting rails shared by all modules: register/resume, four languages
(EN/DE/FR/IT), approval snapshots, exports, and Case Lab — offline evaluation
that measures **coaching judgment** (does the agent ask the right next
question, resist a comfortable answer, know when to stop?), not just output
shape.

### Phase-gated coaching

The agent's attention is scoped to one phase at a time. A deterministic signal
(never the model itself) decides which phase is active; the phase decides what
the agent is trying to accomplish; the user sees the phase and is asked before
the coach moves on ("We have the story. Ready to look at why?"). This is both a
quality mechanism — the model cannot talk itself past a gate it does not
control — and the answer to "what do I do next?".

## The modules

### 1. Incident Investigation (built — being polished)

The existing coach: story → facts and timeline → causes → measures → report.
Three cause methods (5 Whys, Ursachenbaum, Ishikawa) share one data model, so
switching methods is lossless. Actual harm is separated from credible worst
realistic potential (A–E), and investigation depth follows potential, not luck.

Polish direction:

- **Dissociate the phases.** Today the coach "tries around" — fact gathering,
  cause hunting, and measure finding blur into each other. Move to phase-gated
  coaching (above): the readiness signal gates the phase, the phase scopes the
  prompt, transitions are explicit and user-visible.
- Keep and protect the anti-blame, work-as-done framing — it is the product's
  strongest asset.

### 2. Process Mapping (next — prototype)

A standalone coach that interviews someone about how their company actually
works and produces a **hierarchical process map**: process → subprocess →
activity, where each node is annotated with the flows that cross it (material
in/out, information, money). Useful on its own for SOPs, ISO certification
scope, LEAN work — and it happens to be exactly the decomposition a Swiss-style
risk assessment starts from.

Shape rules (learned the hard way elsewhere):

- The **decomposition is the object**; flows are annotations on nodes. We do
  not build a BPMN/value-stream editor.
- The **diagram is a generated view**, never the editing surface. Edits happen
  in the conversation or the table, like the II cause tree.
- Map the process **as it actually runs**, not as the handbook says — ask about
  exceptions, rework loops, workarounds. An as-imagined map poisons everything
  downstream.

### 3. HIRA / Gefährdungsermittlung (after process mapping — Swiss method)

A risk-assessment coach following the pragmatic Swiss approach: **Prozess →
Teilprozess → Tätigkeiten**, then hazard identification, then risk assessment.
Source method and templates live in `/home/oliver/Projects/Gefährdungsermittlung/`
(Leitfaden BO.539, the seminar deck's step-by-step approach, and the
FO.556-style form with matrix, which is the export target the record slowly
fills).

Method commitments:

- **The manager drives; the safety organisation approves** the result
  (approval-snapshot pattern, same as II).
- **Our severity categories** with a severity × likelihood matrix (not the SUVA
  insurance small/large-handicap matrix).
- **Likelihood is an appraisal, not a statistic.** A 100-person company with
  five accidents a year cannot learn likelihood from its own data. The rating
  is a structured judgment used for prioritisation and decision-making —
  nothing more, and that is enough.
- **The mirror principle.** Likelihood is judged against controls **as they are
  actually practiced today** — if everyone should wear glasses but doesn't,
  rate the risk of the real situation. This is explicitly not a green-light
  documentation exercise; the point is that managers learn to look honestly at
  the risks they carry. The coach's job includes gently refusing "there is a
  rule for that" as an answer to "what actually happens?".

### Parked

- **JHA** — out of the picture for now. The help doc stays as a description of
  a planned workflow; no build work.
- **Cross-module integration** (incident → HIRA follow-through, process map
  feeding HIRA, findings as hazard intake) — deliberately not now. The action
  origin-contract already keeps these seams open at zero ongoing cost; we tie
  things together only when the individual modules have proven themselves.

## Non-goals

- An EHS suite, dashboards-first product, or compliance green-light generator.
- Automated investigation or "AI finds the root cause" claims — the human
  accepts every entry in the record.
- Diagram editors, likelihood statistics, and any feature whose main audience
  is an auditor rather than the person doing the work.

## Who it serves

The **frontline manager** writes; the **safety professional** approves and
coaches; the **worker** is protected by blame-free framing throughout. Exports
speak to each audience in its own register (manager one-pager, full report,
team communication).
