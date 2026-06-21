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

Requires `.env` (see `.env.example`) with `SAFETYSECRETARY_DEV_AUTH_BYPASS=1`,
`NEXT_PUBLIC_SAFETYSECRETARY_DEV_AUTH_BYPASS=1`, a `DATABASE_URL` pointing at the
dev container (port 5435), and an `OPENAI_API_KEY` for live coaching.
`LLM_TEXT_MODEL` selects the model (dev default in `.env`: `gpt-5.2`;
the provider falls back to `gpt-4o-mini` without it — too weak for
coaching quality, fine for plumbing).

## Provider behaviour

The coach calls the normal LLM dispatch chain (local override → BYOK →
self-hosted `LLM_BASE_URL` → hosted OpenAI). In `NODE_ENV=test` the
dispatch uses mock providers; the coach reads a sequential fixture from
`SAFETYSECRETARY_II_COACH_MOCK_SEED_PATH` (see
`tests/fixtures/llm/ii-coach-chat.json`).

## Flue runtime

Set `SAFETYSECRETARY_II_COACH_RUNTIME=flue` to route chat turns through the packaged
Flue agent in `.flue/agents/incident-investigation.ts`. The Flue agent
instance id encodes tenant id + incident id, so the durable agent boundary is
one case, not one browser tab or one logged-in user.

The agent's authored tools use Flue 1.0 Valibot schemas. `read_incident_record`
returns a compact case-owned record view plus `proposalDigest`,
`causeTreeDigest`, and `phaseSignal`. The full app context bundle is
intentionally not returned to the model on every turn.

The Next runtime admits each turn with `client.agents.send(...)` and waits on
the Flue durable event stream for the matching `operationKind: "prompt"` result.
Do not switch this back to blocking `client.agents.prompt(...)`: long-thinking
models can exceed a single HTTP wait while the durable stream continues making
progress.

Experience mining should use durable sources:

- tenant Postgres incident tables for accepted facts, timeline events, causes,
  actions, and HIRA follow-ups;
- `incident_coach_message` for assistant turns, proposed operations, and
  accept/dismiss decisions;
- Flue `flue_session_entries` when the agent conversation tree itself is
  needed;
- Flue `submissionId` / event-stream coordinates for runtime debugging and
  replay.

Do not use `flue_event_stream_entries`, `flue_event_streams`, or
`flue_agent_stream_chunks` as the primary product-learning corpus. In Flue 1.0
the durable event stream is much cleaner than 0.11: `turn_request` is
in-process only, `message_end` is the authoritative completed message event,
and streaming deltas are progress signals. Event streams are good for runtime
debugging/replay; accepted app records and coach-message decisions are better
for mining safety-investigation experience.

Prune Flue telemetry with:

```bash
pnpm flue:prune
```

Relevant knobs:

- `SAFETYSECRETARY_FLUE_SQLITE_PATH` selects the Flue SQLite file.
- `SAFETYSECRETARY_FLUE_STREAM_RETENTION_HOURS` controls legacy timestamped stream
  retention on pre-1.0 SQLite files. Flue 1.0 event streams do not expose a
  stream-created timestamp, so the pruner does not delete them by age.
- `SAFETYSECRETARY_FLUE_PRUNE_VACUUM=1` runs `VACUUM` and a WAL truncate checkpoint to
  reclaim disk after pruning.

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
