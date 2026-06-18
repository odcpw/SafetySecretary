# Pass 01 Rejection Log

These candidates were intentionally rejected or deferred because they are Type IV/V lookalikes, high-risk security boundaries, or low-payoff abstractions.

## R1 — Do not merge invitation redemption with magic-link invitation acceptance

- Status: rejected for now
- Clone type: Type IV semantic clone
- Files:
  - `src/lib/auth/invitations.ts`
  - `src/lib/auth/magic-link.ts`
- Why not:
  - Both flows touch pending invitations and tenant membership upserts, but the invariants differ.
  - `redeemInvitation(...)` enforces a logged-in user email match and returns stable domain-specific failure reasons (`invalid`, `expired`, `used`, `mismatch`).
  - `acceptPendingInvitationForTargetTenant(...)` is part of magic-link sign-in resolution and returns `UserTenant | null`.
  - Collapsing these would couple two auth flows with different error contracts and different caller expectations.

## R2 — Do not unify incident `persons` and `actions` API routes into a generic CRUD route

- Status: rejected for now
- Clone type: Type V accidental rhyme
- Files:
  - `src/app/api/incidents/[id]/persons/route.ts`
  - `src/app/api/incidents/[id]/actions/route.ts`
- Why not:
  - They share route skeletons (`GET` / `POST` / `PATCH` / `DELETE`) but validate different payloads, redirect behaviors, not-found codes, and bridge side-effects.
  - `actions` touches action-bridge synchronization and cause-node relationships; `persons` does not.
  - A generic route helper here would hide domain differences rather than simplify them.

## R3 — Do not genericize the coach editors into one "list editor" component

- Status: rejected for now
- Clone type: Type V accidental rhyme
- Files:
  - `src/components/incident/coach/TimelineEditor.tsx`
  - `src/components/incident/coach/CauseTreeEditor.tsx`
  - `src/components/incident/coach/ActionPlanEditor.tsx`
- Why not:
  - The editors look similar in UI structure but carry different state transitions, validation rules, summaries, and side-effects.
  - They are tied to distinct domain objects: timeline events, cause nodes, and action measures.
  - A shared editor abstraction would likely create parameter sprawl and obscure workflow-specific behavior.

## R4 — Do not split or decompose `CoachWorkbench.tsx` just because it is large

- Status: deferred pending stronger proof
- Clone type: not a clone target
- Files:
  - `src/components/incident/coach/CoachWorkbench.tsx`
- Why not:
  - The slop scan flagged it as an "everything hook" hotspot, but file size alone is not the lever.
  - This pass found a few bounded helper extractions inside the workbench, not a safe basis for broad component surgery.
  - Any larger decomposition would need route-level and browser-level proof, not just local unit tests.

## R5 — Do not abstract page-local translation wrappers yet

- Status: rejected as too low value
- Clone type: Type I, but below threshold
- Files:
  - `src/app/workspace/actions/page.tsx`
  - `src/app/workspace/actions/[id]/page.tsx`
  - `src/app/workspace/actions/new/page.tsx`
  - `src/app/workspace/company/delete/page.tsx`
  - `src/app/workspace/settings/vision/page.tsx`
  - `src/app/workspace/settings/danger-zone/page.tsx`
  - `src/app/workspace/settings/members/page.tsx`
- Why not:
  - The repeated `return t(key, locale);` helpers are real, but the LOC savings are negligible.
  - This would add an abstraction without reducing a meaningful maintenance burden.

## R6 — Treat `slop_scan.md` "_none found_" results as non-authoritative for TS/TSX sections

- Status: tooling rejection
- Why not:
  - The installed `rg` rejects `--type tsx`, and the skill script suppresses stderr in its internal capture commands.
  - Several empty sections in `slop_scan.md` are therefore scanner gaps, not strong negative evidence.
  - Manual `rg -g '*.ts' -g '*.tsx'` fallback scans should continue to drive TS/TSX candidate selection in later passes.
