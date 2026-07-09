# Incident Investigation canvas — v0 design

_Draft 2026-07-09. A full-screen, pannable canvas replacement for the tab-heavy
II workbench, reusing the process-map canvas patterns (pan/zoom, fog, floating
composer). Ships behind a toggle beside the existing workbench; nothing is
removed until it proves out._

## Why

The live II workbench is data-rich but presentation-poor: the investigation
(facts, a real left-to-right attributed cause tree, measures) is buried behind
six tabs and a cramped half-pane at 10px. "The record fills itself" happens
off-stage. The canvas gives the investigation the geography it already has —
**time** and **causality** — and makes the coach's questions visible as fog.

## Layout — two bands, both reading left-to-right

- **Timeline band (top).** Horizontal, L→R by time: before-facts → **the
  event** (a prominent, larger anchor node) → after-facts / immediate actions.
  Facts are cards with their attribution ("Bay team · 2026-06-14"). Photos pin
  to the fact/timeline-event they belong to.
- **Cause tree band (below).** The existing Ursachenbaum, canvas-rendered.
  Grows L→R by causal depth, **rooted under the event anchor** (short vertical
  connector joins the two bands): event/effect on the left, reading rightward
  through the whys, **root causes + their measures on the right edge** (the
  actionable end). This is the current `cause-tree-layout` direction, given the
  canvas treatment. Both bands point the same way; height alone separates
  "when" (top) from "why" (bottom).

One shared pan/zoom viewport. The timeline band may be pinned at a fixed y with
only the tree panning vertically — decide during build; simplest first is one
shared pannable surface with the timeline as the top rank.

## Fog = branch status (II already has this)

- **OPEN branch tip** → fogged stub containing the coach's actual next question
  ("Why was the reversing alarm intermittent? — maintenance would know"). This
  is the missing-cause nudge as weather, not a notification.
- **PARKED** → greyed, "beyond our scope" label.
- **ROOT_REACHED** → solid, anchored (a small root marker).
- Header shows **% complete** from the existing readiness signal; the reminders
  box dissolves into fog-you-can-see plus that one number.

## Measures

Corrective actions hang as chips on their linked cause node (toward the roots
on the right). A measure missing an owner or due date wears a badge in place —
the cause→measure prevention logic becomes visible instead of tab-buried.

## Method = lens, not destructive toggle

Same node set, relayout only (the data model already supports all three):
- **5 Whys** — highlight/collapse to the main chain per branch.
- **Ursachenbaum** — full fact-by-fact tree (default).
- **Ishikawa** — re-cluster the same nodes by category around a spine, effect
  at right. A lens switch never mutates data (unlike today's dropdown).

## Interaction

- **Selection = conversational focus.** Tap the event, a fact, or a cause →
  the floating composer shows "talking about: <node>"; the answer/operation the
  coach proposes lands there. Tap an open-branch fog stub → the composer
  pre-loads that branch's question. This is walk-the-floor mode on a tablet.
- **Floating composer pill** (dockable), voice (hold-to-talk), and a manual
  "+" to add a fact/cause directly (human = direct, coach = ghost proposal, per
  the process-map rule).
- **Ghost proposals on canvas.** Coach proposals render as translucent nodes /
  edges in place with accept/dismiss; accepting solidifies them (and clears fog
  if the branch reached a root). A small "review all (n)" for bulk.
- Detail-on-tap: the overview fields (title/when/where/severity/type) become the
  event anchor's detail card — no separate Overview tab.
- Mobile: touch pan / pinch zoom / tap select, from slice 1.

## What it retires

The six tabs, Graphical-as-separate-tab, the reminders box, most of the header
button row (Export/Approve stay as a small menu). The split-pane chat becomes
the floating composer.

## Build slices (codex-executed, one at a time, behind a toggle)

1. **Read-only II canvas** at a new route (e.g. `/incidents/[id]/canvas`),
   toggle link from the workbench. Loads the existing incident record (facts,
   timeline, cause nodes, edges/parenting, measures, branch status, readiness)
   via existing endpoints; renders the timeline band + L→R cause tree + fog +
   measure chips + % complete. Pan/zoom/touch, modeled on the process-map
   canvas. No coach, no editing. This is the "does it look right" slice — judge
   it on the real forklift case (8 facts, 7 causes, 10 measures) and on mobile.
2. Selection-as-focus + the floating composer wired to the existing coach
   chat/apply endpoints; ghost proposals on canvas.
3. Method-as-lens relayout; measure-owner badges; detail-on-tap for overview
   fields; export/approve menu.
4. Extract the shared canvas engine (pan/zoom, fog, node/edge render, ELK,
   composer) used by both process-map and II; delete duplication.
5. Once proven, make it the default; keep the old workbench one release behind a
   flag, then remove.

## Reuse note

Slice 1 copies the process-map canvas patterns rather than prematurely sharing
code; slice 4 does the extraction after both surfaces exist and the shared
shape is obvious. No data-model changes — II already has facts, timeline,
cause tree, branch status, and measures.
