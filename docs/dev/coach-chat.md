# II Coach Chat (chat-first investigation surface)

The coach chat is the conversational spine of the incident investigation:
the user talks, the coach asks the next valuable question, and everything
established lands in the structured record as reviewable operations.

## The background cause tree

Every turn, `src/lib/incident/cause-tree.ts` renders a deterministic
digest of the cause tree (branch numbers B1/B1.1, full UUIDs, status
markers `[OPEN]` / `[ROOT]` / `[PARKED]` / `[TREATED: n measures]`) into
the prompt as `CAUSE TREE STATUS`. This is what lets the coach chain
deeper whys under their parent (`parentId`), park branches beyond the
team's control (`cause_update` → `branchStatus PARKED`), notice branches
that still lack measures, and give honest closing summaries. No extra
LLM call — it is computed from the record.

Branch states live in `incident_cause_node.branch_status`
(OPEN / ROOT_REACHED / PARKED, migration 00310). The record panel's
Cause tree tab is an interactive editor (add why, edit, drag to
re-parent, mark root/parked) backed by the causes API with server-side
cycle prevention.

Photo evidence: uploads in the chat photo strip attach to a dedicated
"Photo evidence" timeline event; analysis goes through the dispatch
vision consent gates; captions (`incident_attachment.caption`,
migration 00320) are the user's descriptions, editable in the record
panel's Photos tab and embedded in the full report.

## Surface

- Page: `/incidents/[id]/coach` — chat on the left, living record on the
  right (Overview / Story / Causes / Measures tabs). Proposals appear as
  cards under each coach message with Accept / Edit / Dismiss and
  "Accept all". Exports (full report Word/PDF, comms one-pager) are in the
  page header.
- Manual editing stays available through the existing workbench pages;
  the coach never blocks anything.

## Where things live

| Piece | Path |
|---|---|
| The brain (system prompt) | `src/lib/incident/coach-prompt.ts` |
| Conversation service (persist, dispatch, parse) | `src/lib/incident/coach-chat.ts` |
| Chat API | `src/app/api/incidents/[id]/coach/chat/route.ts` |
| Apply/dismiss API | `src/app/api/incidents/[id]/coach/chat/apply/route.ts` |
| Record snapshot API | `src/app/api/incidents/[id]/record/route.ts` |
| UI | `src/components/incident/coach/` |
| New op kind (`incident_field_update`) | `src/lib/agent/types.ts`, `structured-operations.ts`, `incident-investigation/apply-operation.ts` |
| Conversation table migration | `db/sql/00300_incident_coach_message.sql` |

The conversation is stored per incident in `incident_coach_message`
(tenant schema), including each assistant message's operations and the
user's apply/dismiss decisions.

## Dev setup

```bash
pnpm dev:bootstrap   # starts the pgvector dev DB (docker), migrates, seeds a demo incident
pnpm dev             # then sign in via the dev button on /signin
```

Requires `.env` (see `.env.example`) with `SSFW_DEV_AUTH_BYPASS=1`,
`NEXT_PUBLIC_SSFW_DEV_AUTH_BYPASS=1`, a `DATABASE_URL` pointing at the
dev container (port 5435), and an `OPENAI_API_KEY` for live coaching.
`LLM_TEXT_MODEL` selects the model (dev default in `.env`: `gpt-5.2`;
the provider falls back to `gpt-4o-mini` without it — too weak for
coaching quality, fine for plumbing).

## Provider behaviour

The coach calls the normal LLM dispatch chain (local override → BYOK →
self-hosted `LLM_BASE_URL` → hosted OpenAI). In `NODE_ENV=test` the
dispatch uses mock providers; the coach reads a sequential fixture from
`SSFW_II_COACH_MOCK_SEED_PATH` (see
`tests/fixtures/llm/ii-coach-chat.json`).

## Tests

```bash
DATABASE_URL=... pnpm test:incidents:coach-chat
```

## Judging coach quality

Unit tests cover plumbing, not intelligence. Judge the coach by reading
live transcripts: run a realistic incident through the chat (the seeded
forklift near miss works well) and check, per the skill's values:

- it refuses "be more careful" as a cause and reframes to conditions;
- it pushes one level up the S-T-O-P hierarchy when offered PPE/signage;
- measures end concrete (who, what, by when);
- depth matches potential severity; it stops when the record is good;
- replies stay in the user's language.

A transcript that accepts a blame answer or dumps a questionnaire is a
failing transcript — fix the prompt, not the UI.
