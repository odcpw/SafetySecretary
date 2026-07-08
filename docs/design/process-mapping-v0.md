# Process Mapping Coach — v0 design

_Draft spec, 2026-07-08. Implements the "Process Mapping" module from
[docs/VISION.md](../VISION.md). Prototype scope: one person, one conversation,
one process map. Standalone module; shares building blocks with II but is not
coupled to it._

## Why this first (before HIRA)

The Swiss HIRA method begins with **process → subprocess → activity**. That
decomposition is exactly what a process map is. Building process mapping first
(a) delivers a standalone useful artifact (SOP scaffolds, ISO scope, LEAN,
onboarding) and (b) de-risks HIRA's first phase and proves the shared coaching
grammar on a second domain before HIRA depends on it.

## The object

A **process map**: a hierarchical decomposition of how a company/area actually
works, where each node is annotated with the flows that cross it.

- **Decomposition is the object.** `process → subprocess → activity` as a tree.
- **Flows are annotations on nodes**, not the structure: each node records what
  crosses it — material, information, money — in each direction.
- **The diagram is a generated view, never the editing surface.** Editing
  happens in the conversation and the outline table. Layout is computed from the
  tree (reuse the `cause-tree-layout` / `fishbone-layout` approach).
- **Map work-as-done, not as-imagined.** The coach probes exceptions, rework
  loops, and workarounds; an as-imagined map poisons everything downstream.

## Data model (tenant-schema tables, mirroring the incident pattern)

Follow the established conventions: raw-SQL migration with an idempotent
`apply_*_schema(tenant_schema)` function wired into `provision_tenant_schema`;
`timestamptz`; `deleted_at` soft-delete; self-parent FK `ON DELETE CASCADE`
guarded in app code by reparent-before-delete (see the incident cause-node fix).

- **`process_map`** — the document/case.
  `id, title, scope_note, status (DRAFT|APPROVED), content_language,
  created_by → shared.users, created_at, updated_at, deleted_at`.
- **`process_node`** — one node in the tree.
  `id, map_id → process_map, parent_id → process_node (nullable, self-FK,
  ON DELETE CASCADE), kind (PROCESS|SUBPROCESS|ACTIVITY), order_index,
  name, description, created_at, updated_at`.
  Invariants (copy from cause-node): terminating ancestor walk for cycle
  prevention on reparent; `pg_advisory_xact_lock` per map for order_index
  allocation; reparent children up one level before delete.
- **`process_flow`** — a flow annotation on a node.
  `id, map_id → process_map, node_id → process_node (ON DELETE CASCADE),
  direction (IN|OUT), flow_type (MATERIAL|INFORMATION|MONEY), label,
  counterparty (nullable text: where it comes from / goes to), order_index,
  created_at, updated_at`.

## Coaching grammar (shared with II)

Same loop: talk → coached questions → structured proposals → accept/edit/reject
→ record fills → export. Reuse the runtime, the structured-operation contract
(Zod discriminated union, forbidden-target rejection), the atomic
claim-before-apply decision gate, and the trace store.

### Structured operations

- `node_add` — `{ parentRef?, kind, name, description? }`
- `node_update` — `{ nodeId, name?, description?, kind? }`
- `node_move` — `{ nodeId, newParentRef? }` (null → top level)
- `flow_add` — `{ nodeId, direction, flowType, label, counterparty? }`
- `flow_update` — `{ flowId, ...fields }`
- `flow_remove` — `{ flowId }`
- `ask_question` — coach asks, no write

All operations are proposals; nothing writes until the human accepts. The
apply path re-validates and never trusts persisted JSON — same as
`applyIncidentCoachOperation`.

### Phase-gated interview

The deterministic readiness signal gates the phase; the phase scopes the
prompt; transitions are explicit and user-visible ("We have the shape of the
process. Ready to map what flows through it?").

1. **Scope** — what area/company/process are we mapping? Name the top-level
   process(es).
2. **Decompose** — break each process into subprocesses, then activities.
   Work-as-done probes: "walk me through a normal run"; "what happens when it
   goes wrong?"; "does anyone do this differently?".
3. **Flows** — for the activities that matter, what comes in and goes out
   (material / information / money), and from/to whom.
4. **Review** — the coach surfaces gaps: activities with no flows, a subprocess
   with a single child, dangling nodes; offers the generated diagram.

## Workbench

Left: chat (reuse `CoachWorkbench` patterns — mounted-ref guards, abort
controller, per-operation locking, accept/edit/reject cards). Right: the map,
tabs:

- **Outline** — editable tree (like the cause tree): add/rename/move/delete
  nodes, set kind. This alone proves the loop for v0.
- **Flows** — per-node flow rows (direction, type, label, counterparty).
- **Diagram** — generated read-only view (deferred past the first slice).

## Build slices (small, sequential, supervised — codex writes)

1. **Data layer.** Migration (`process_map`, `process_node`, `process_flow`)
   with the apply-function + provisioning hook; lib CRUD with reparent-safe
   delete and advisory-locked order_index; integration tests provisioning the
   schema (session-cookie auth from the start).
2. **Coach skill + apply path.** Prompt, structured-operation schema + parse +
   `applyProcessMapOperation`, mirroring the II agent module. Unit tests on the
   operation contract; a deterministic MockProvider fixture.
3. **API routes.** Map register (list/create), map GET, coach chat + apply —
   mirror the incident coach routes including session + per-route CSRF.
4. **Workbench UI.** Chat + Outline tree + accept/reject cards.
5. **Discoverability.** Enable the "Process Mapping" landing tile; add it to
   the (to-be-built) global nav; empty-state + demo map.

## Explicitly deferred for v0

Generated diagram polish; Flows tab richness; SOP/ISO-scope/LEAN exports;
approval snapshots; any tie to HIRA or II. Keep the seam open (the action
origin-contract already reserves origins), wire nothing.
