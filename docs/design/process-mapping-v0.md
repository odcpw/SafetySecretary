# Process Mapping Coach — v0 design

_Rev 2, 2026-07-08, after design discussion. Supersedes rev 1 and the earlier
interview draft. Implements the "Process Mapping" module from
[docs/VISION.md](../VISION.md)._

## Product thesis

Signavio-class tools need a trained modeler and a blank canvas; we need a
foreman and twenty minutes. The agent replaces both the notation and the
facilitator: the user narrates, the coach structures, nothing lands without
acceptance. And unlike a drawing, the result is a **queryable model of the
operation** — typed blocks, edges with routing reasons, resources, times,
hearsay flags — that later agent passes (savings scan, SOP drafts, risk prep,
re-interview for freshness) can read. Modules stay independent; they all get to
read the same map.

## The object: a river with zoom, not a tree

Two relations, both first-class:

- **Containment** (parent/child) — the zoom. Click "logistics", see
  racking / un-racking / loading. Depth is open-ended (PROCESS → SUBPROCESS →
  ACTIVITY, deeper allowed).
- **Sequence edges** (sibling → sibling) — the river. Forks, rejoins, and
  loops (rework, weekly maintenance) are all legitimate. Every fork carries a
  one-line routing note answering *why it splits* (by product? by capacity? by
  exception?). Example that must be representable: granule preparation forks
  into molding vs. injection lines (different machines), both rejoin at
  packaging onto shared pallets/racking/loading.

The diagram is a **generated view** — never the editing surface. Edits happen
in conversation and the outline.

### No money flows — three layers of money truth

- **Mechanics** (billing monthly, damage recharges, timesheets) are ordinary
  activities with **information flows** — fully mappable, and what SOP/ISO/risk
  actually need.
- **Hooks** are **resources** on blocks (roles, equipment, material pools) —
  where salaries/capex/depreciation attach *implicitly*. Never ask for amounts.
- **Amounts** (P&L, per-part cost) are a different artifact. The coach never
  asks. Flows are MATERIAL and INFORMATION only.

## Data model (tenant schema; 00460 already shipped map/node/flow)

Additions (migration 00470):

- **`process_edge`** — the river.
  `id, map_id → process_map (CASCADE), from_node_id → process_node (CASCADE),
  to_node_id → process_node (CASCADE), routing_note text NULL,
  order_index int, created_at, updated_at,
  CHECK (from_node_id <> to_node_id), UNIQUE (map_id, from_node_id, to_node_id)`.
  Cycles allowed (loops are real). Edges connect nodes of the same map; app
  code validates same-parent is NOT required (edges may cross containment
  levels in v0 we keep them sibling-level — coach only proposes sibling edges).
- **`process_resource`** — the turtle's "with what / with whom" (L2).
  `id, map_id (CASCADE), node_id → process_node (CASCADE),
  resource_type CHECK IN ('ROLE','EQUIPMENT','MATERIAL_POOL'), label text,
  quantity_note text NULL ("2 riggers", "1 forklift"),
  returnable boolean NOT NULL DEFAULT false (true for asset pools that cycle
  back, e.g. scaffold material), order_index, created_at, updated_at`.
- **`process_node` new columns**:
  `source_confidence text NOT NULL DEFAULT 'DIRECT' CHECK IN ('DIRECT','HEARSAY')`
  — hearsay = narrator described someone else's work; visibly thin, to confirm
  in a later session with that person.
  `duration_note text NULL, frequency_note text NULL` — free-text ranges with
  provenance ("2–3h, foreman's estimate"; "weekly"). Structure first; numbers
  are a later annotation pass, never blocking.

Store semantics (extend `src/lib/process-map`):

- `deleteProcessNode` already promotes children; additionally **bridge edges**:
  for each incoming (X→deleted) and outgoing (deleted→Y), create (X→Y) if
  absent, then delete — the river stays connected.
- Edge add validates: same map, no self-edge; duplicate (from,to) is a no-op
  returning the existing edge.
- All mutations under the existing per-map advisory lock.

## Definition of done (the coach's one standard — no "purpose" question)

Like II's "well-executed investigation", the map has one internal standard,
checked by a deterministic readiness signal:

1. **Spine complete**: an unbroken edge-path from trigger (order/job exists) to
   delivered-and-billed; no "then magic happens" gaps.
2. **Forks explained**: every node with >1 outgoing edge has a routing note.
3. **Rejoins/loops explicit** (edges exist; loops labeled by their trigger,
   e.g. "weekly", "on failed QC").
4. **Working level owned**: each leaf block has ≥1 ROLE resource; key blocks
   have their with-what (EQUIPMENT/MATERIAL_POOL).
5. **Thin spots named**: HEARSAY blocks and empty branches are surfaced in
   review, not hidden.

## Interview design (phase-gated; deterministic signal picks the phase)

Voice: plain, warm, one question at a time; reflects back before asking next;
never lectures process theory. **5–12 blocks per level, always** — past that,
the coach proposes grouping ("these four look like 'site logistics' —
bundle them?").

1. **Icebreaker — follow one thing.** "Pick one concrete thing — a pallet, an
   order, one scaffolding job — and walk me through its life from the moment
   it exists until it's delivered and paid. Don't polish it." One
   thing-followed per map; other product families are their own maps (shared
   blocks may recur).
2. **Spine.** Turn the narration into ordered sibling blocks + edges. Boundary
   probe: what happens just before / after. Close the gaps in the chain.
3. **Forks, rejoins, loops.** "Does every [thing] go the same way?" — capture
   splits with routing notes, merges, rework/maintenance loops.
4. **Drill where it matters.** Decompose blocks that are thick (many people,
   risky, frequent trouble) — coach proposes, user decides. Work-as-done
   probes fire here: exceptions ("most common way this goes sideways?"),
   rework ("does anything come back?"), variation ("what does the experienced
   person do that a new one wouldn't?"), the quiet step ("not written down but
   everyone knows"). Persist on load-bearing blocks; ask-once elsewhere.
   HEARSAY marking: "you *think* logistics re-racks overnight — I'll flag that
   to confirm with them."
5. **Resources (L2).** For working-level blocks: who does it, with what
   (equipment / material pools, returnable flagged). Light touch.
6. **Review.** Coach re-reads the map against the definition of done, names
   holes ("packaging has no owner; the recycling fork has no rejoin — where
   does it end?"), offers to fill or leave them. Times/frequencies offered as
   an optional final pass, ranges + provenance only.

## Structured operations (proposal-gated, mirroring II)

`node_add {parentRef?, kind, name, description?}` ·
`node_update {nodeId, name?, description?, kind?, durationNote?, frequencyNote?, sourceConfidence?}` ·
`node_move {nodeId, newParentRef?}` · `edge_add {fromRef, toRef, routingNote?}` ·
`edge_remove {edgeId}` · `flow_add/update/remove` (MATERIAL/INFORMATION only) ·
`resource_add {nodeRef, resourceType, label, quantityNote?, returnable?}` ·
`resource_remove {resourceId}` · `ask_question`.

Same contract as II: Zod-validated, human accepts each card, apply path
re-validates and claims atomically; refs resolved via operationRecordMap.

## v0 build & test plan (codex executes everything)

1. Migration 00470 + store extension + integration tests (edges incl. bridge-
   on-delete, resources, confidence/duration fields).
2. Coach skill: prompt implementing the interview; parse; apply path;
   readiness signal implementing the definition of done; unit tests with a
   deterministic MockProvider fixture.
3. **Simulation harness** (`scripts/process-map/simulate.ts`): scripted
   narrator personas played against the live coach (BYO key from .env),
   auto-accepting proposals; dumps the final map (outline + edges + resources
   + readiness verdict) as markdown for human judgment. Personas: (a)
   scaffolding company end-to-end incl. monthly billing and damage handling,
   (b) plastic factory with the molding/injection fork rejoining at packaging,
   (c) a simple bakery as the small control.
4. Judge the maps; iterate the prompt; only then routes + workbench UI.

## Explicitly deferred

Routes + UI (after maps prove out) · generated diagram polish · L3 time-pass
tooling · L4 agent passes (savings scan, SOP drafts, re-interview) · approval
snapshots · any HIRA/II coupling.
