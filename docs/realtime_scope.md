# Realtime / Multi-User Scope (v1 Decision)

## Decision
**v1 is facilitator-only editing (single active editor), no WebSocket-based realtime collaboration.**

The initial “meeting-room assistant” flow is optimized for a shared screen or one operator driving the session. Other participants can contribute verbally or by suggesting text, but the app does not attempt concurrent multi-device edits.

## What v1 supports
- Single browser session as the **source of truth** for edits.
- Other devices may **view** by refreshing / navigating, but **no live cursors**, **no conflict resolution**, and **no realtime presence**.
- Background jobs (LLM extract/parse/apply) can be polled via existing REST endpoints.

## What v1 explicitly does NOT support
- WebSockets / server push for table updates.
- Simultaneous editing with merge/conflict handling.
- Offline editing and later sync.

## Rationale
- Current backend is REST + in-memory job state; adding realtime collaboration adds:
  - presence + session identity
  - edit conflict strategies
  - event streaming + reconnection behavior
  - data model constraints and locking semantics
- Facilitator-only covers the core meeting-room use case with much lower risk.

## Implications
- UI/UX should surface “**Facilitator mode**” expectations:
  - encourage screen sharing
  - provide fast keyboard-first editing and clear saved feedback
- Any “share link” behavior should be framed as “view + refresh”, not “live collaborative editing”.
- If multi-user is required later, add it as a **v2** track:
  - define conflict strategy (last-write-wins vs field-level merge vs locking)
  - add WebSocket layer + event model
  - add optimistic concurrency (row versioning / updatedAt checks)

