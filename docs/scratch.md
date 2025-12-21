# Scratchpad: UX/Workflow Audit Follow-Up (2025-XX-XX)

Goal: translate UI/UX audit findings into beads issues with clear background, intent, and dependencies.

Key problem areas (from review):
- Save semantics: steps are draft-only; Continue and top-bar Save do not persist.
- Action management: Action Plan view is read-only for description; Workspace lacks due/status editing and delete.
- Residual risk: cannot clear once set; UI status implies save even when no payload.
- Error handling/status: several autosave paths swallow errors or show misleading state.
- Consistency/polish: category labels vs codes, hazard category edit missing in hazard phase, matrix settings not reactive, landing copy implies local-only storage.

Proposed bead structure:
- Epic: Workflow save semantics + data integrity.
  - Task: decide unified persistence/dirty-state model across phases.
  - Task: implement steps persistence (autosave or explicit) + navigation guard.
  - Task: fix top-bar Save semantics (refresh vs actual save).
  - Task: unify save/error feedback component and usage.

- Epic: Action management parity.
  - Task: define canonical action editing pattern.
  - Task: Action Plan view full CRUD + reorder.
  - Task: Workspace table action edit parity (due/status/delete) + add action improvements.
  - Task: add delete action endpoint to RaContext and UI usage (if missing).

- Epic: Residual risk clearing + validation.
  - Task: define clearing semantics; update backend validation to accept explicit clears.
  - Task: frontend allow clearing selections; update status messaging.
  - Task: tests for clearing baseline/residual.

- Epic: UX polish & clarity.
  - Task: hazard category editing in hazard phase; show labels in workspace.
  - Task: matrix settings reactive in workspace.
  - Task: landing copy clarifies server-backed cases; delete confirmation copy.

Note: include background/reasoning/acceptance in each issue description; add comments as needed.

Created beads (2025-12-20):
- E1 Workflow save semantics + data integrity: SafetySecretary-hp8
  - Policy: SafetySecretary-hp8.1
  - Steps persistence: SafetySecretary-hp8.2
    - Dirty tracking: SafetySecretary-hp8.2.1
    - Persist edits + reorder: SafetySecretary-hp8.2.2
  - Top-bar save semantics: SafetySecretary-hp8.3
  - Save/error feedback: SafetySecretary-hp8.4
- E2 Action management parity: SafetySecretary-edg
  - Canonical action behavior: SafetySecretary-edg.1
  - API/context support: SafetySecretary-edg.2
  - Action Plan CRUD: SafetySecretary-edg.3
  - Workspace parity: SafetySecretary-edg.4
- E3 Residual clearing + validation: SafetySecretary-qt8
  - Clearing semantics: SafetySecretary-qt8.1
  - Backend support: SafetySecretary-qt8.2
  - Frontend clearing: SafetySecretary-qt8.3
  - Tests: SafetySecretary-qt8.4
- E4 UX polish + clarity: SafetySecretary-653
  - Category UX: SafetySecretary-653.1
  - Matrix settings propagation: SafetySecretary-653.2
  - Landing copy: SafetySecretary-653.3
  - Terminology pass: SafetySecretary-653.4
- E2 Action management parity add-on:
  - Action Plan hazards with no actions + inline add: SafetySecretary-edg.5

Auth/user management beads (2025-12-20):
- Epic: SafetySecretary-q5l Multi-tenant auth + user management (beta)
  - SafetySecretary-q5l.1 Auth decision log (lockout TTL, session TTL, slug rules, admin access)
  - SafetySecretary-q5l.2 Registry DB schema (orgs, users, memberships, sessions, audit)
  - SafetySecretary-q5l.3 Tenant DB provisioning + migrations (org-per-DB)
  - SafetySecretary-q5l.4 Tenant-aware routing + Prisma client selection
  - SafetySecretary-q5l.5 Auth backend: login/logout + session store
  - SafetySecretary-q5l.6 Auth backend: password hashing + admin-set credentials
  - SafetySecretary-q5l.7 Auth backend: rate limiting + lockout w/ remaining attempts
  - SafetySecretary-q5l.8 Auth backend: login audit log
  - SafetySecretary-q5l.9 Admin UI: org + user management
  - SafetySecretary-q5l.10 Admin CLI: org provisioning + migrations
  - SafetySecretary-q5l.11 Frontend: login page (org slug + username + password)
  - SafetySecretary-q5l.12 Frontend: route protection + auth bootstrap
  - SafetySecretary-q5l.13 Frontend: user menu + settings stubs
  - SafetySecretary-q5l.14 Attachment isolation: per-org storage roots
  - SafetySecretary-q5l.15 Attachment encryption at rest (per-org keys)
  - SafetySecretary-q5l.16 Session hardening: CSRF + cookie security
  - SafetySecretary-q5l.17 Tests: auth flows + tenant isolation
  - SafetySecretary-q5l.18 Tests: attachment encryption + storage isolation
  - SafetySecretary-q5l.19 Beta rollout checklist (security + provisioning)
Auth/user management bead revisions (2025-12-20):
- Added SafetySecretary-q5l.20 Platform admin bootstrap + admin access control
- Added SafetySecretary-q5l.21 Authorization layer: role enforcement
- Added SafetySecretary-q5l.22 UX: session expiry + lockout messaging
- Updated SafetySecretary-q5l.2 to include future API key placeholder + sub-account rationale
- Updated SafetySecretary-q5l.13 to include contact-admin guidance
- Added dependencies: admin UI/CLI depend on platform admin bootstrap; route protection depends on role enforcement
Auth/user management bead revisions (2025-12-20, add-ons):
- Added SafetySecretary-q5l.23 UX: tenant health + friendly errors
- Added SafetySecretary-q5l.24 Admin: logout everywhere (invalidate all sessions)
Localization beads (2025-12-20):
- Epic: SafetySecretary-kxp Localization: EN/FR/DE + per-user language
  - SafetySecretary-kxp.1 I18n approach decision (library, key conventions, fallback rules)
  - SafetySecretary-kxp.2 Translation inventory + key map
  - SafetySecretary-kxp.3 Frontend i18n scaffolding
  - SafetySecretary-kxp.4 Frontend: settings language selector (per-user)
  - SafetySecretary-kxp.5 Frontend string migration: core screens
  - SafetySecretary-kxp.6 Frontend string migration: remaining screens
  - SafetySecretary-kxp.7 Locale-aware formatting (dates, numbers)
  - SafetySecretary-kxp.8 Backend exports: localized labels (PDF/XLSX)
  - SafetySecretary-kxp.9 Backend: pass user locale to export endpoints
  - SafetySecretary-kxp.10 Translation workflow + QA
Localization bead revisions (2025-12-20):
- Added SafetySecretary-kxp.11 Backend: persist per-user locale in registry
- Added SafetySecretary-kxp.12 Localize domain dictionaries (phases, risk scales, categories)
- Updated SafetySecretary-kxp.4 to persist via backend user profile
- Updated SafetySecretary-kxp.9 to use session/user profile locale by default
- Added deps: kxp.11 -> q5l.2, q5l.5; kxp.4 -> kxp.11; kxp.9 -> kxp.11; kxp.12 -> kxp.1/2/3; kxp.6 -> kxp.5; kxp.10 -> kxp.2
