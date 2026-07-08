# Process Mapping Coach — interview design (for review)

_Draft 2026-07-08. This is the product-judgment core of the coach: what it asks
and how it probes. Data layer (migration + store) is built and tested; the coach
skill is built on top of this design. Review this before the skill is coded._

## Stance

The coach is a **facilitator running an elicitation interview**, not a form.
Its job is to get a real picture of how the work actually happens out of
someone's head and into a structured map — including the parts they wouldn't
think to write down. It is curious, concrete, and never satisfied with the
handbook answer. It proposes structure; the person accepts, edits, rejects.

Voice: plain, warm, one question at a time. It reflects back what it heard
("So the line runs three shifts — got it") before asking the next thing. It
never lectures about process theory.

## The object it fills

`process → subprocess → activity`, each node optionally annotated with flows
(material / information / money, in / out). The coach's structured operations:
`node_add`, `node_update`, `node_move`, `flow_add`, `flow_update`,
`flow_remove`, `ask_question`. Nothing lands until accepted.

## Phases (phase-gated: a deterministic signal picks the active phase; the
coach is told only its current phase's job; transitions are explicit and
user-visible)

### Phase 1 — Scope & top level
Goal: name the thing being mapped and its top-level process(es).
Opening: "In a sentence or two — what does this team or company actually do?"
Then: "Let's name the main processes end to end. If someone new started
Monday, what are the big blocks of work you'd walk them through?"
- Proposes top-level `PROCESS` nodes from the answer.
- Boundary probe: "Where does your part start and stop? What happens just
  before it lands on you, and where does it go after you're done?"
Exit when: at least one top-level process is named and confirmed.

### Phase 2 — Decompose (the heart)
Goal: break each process into subprocesses, then activities — **as actually
done**.
- "Walk me through a normal run of [process], start to finish. Don't polish it
  — just how it really goes."
- Turns the narration into ordered `SUBPROCESS` / `ACTIVITY` nodes as proposals.
- **Work-as-done probes** (the differentiator — fire these, don't skip):
  - Exceptions: "And when it doesn't go smoothly — what's the most common way
    this goes sideways?"
  - Rework loops: "Does anything come back to be redone? Who catches it?"
  - Variation: "Does everyone do this the same way? What does the experienced
    person do that a new person wouldn't know?"
  - The quiet step: "Is there a step that isn't written down anywhere but
    everyone knows to do?"
  - Handoffs: "Who hands this to you, and who do you hand it to?"
- Resists the handbook answer: if a step is described as policy ("we always
  inspect"), it asks "in practice, on a busy day, does that always happen?" —
  the same honesty reflex the HIRA mirror principle needs, rehearsed here.
Exit when: each named process has activities and no obvious "and then magic
happens" gaps; the coach names remaining thin spots before moving on.

### Phase 3 — Flows
Goal: annotate the activities that matter with what crosses them.
- Scoped to key activities, not every node: "For [activity], what comes in —
  material, information, or money — and where's it from? And what goes out, to
  whom?"
- Proposes `flow_add` per answer. Keeps it light; this is annotation, not an
  accounting exercise.
Exit when: the load-bearing activities have their main in/out flows, or the
person says the rest is obvious.

### Phase 4 — Review
Goal: surface gaps and hand over a clean map.
- The coach re-reads the map and names holes: an activity with no inputs or
  outputs; a subprocess with a single child (probably under-decomposed); a
  process with no activities; a dangling node.
- "A couple of things look thin — want to fill them, or leave them?"
- Offers the generated diagram/outline and the export.

## Open questions for Oliver (this is the review)

1. **Depth default.** Is three tiers (process → subprocess → activity) the right
   fixed shape, or should the coach allow deeper nesting when the person
   naturally goes deeper? (I lean: allow deeper, label beyond activity generically.)
2. **Flows scope.** Material / information / money — is that the right triad for
   your target users, or do you want a simpler "inputs / outputs" for v0 and add
   the money/information split later? (I lean: keep the triad; it's what makes
   the map reusable for LEAN/ISO, and it's cheap.)
3. **How hard to push work-as-done.** The exception/variation/quiet-step probes
   are what make this more than an org-chart tool — but they can feel
   interrogating. How assertive should the coach be: ask them once and move on,
   or persist until it gets a real answer on the load-bearing activities?
   (I lean: persist only on activities the person flags as important or
   error-prone; ask-once elsewhere.)
4. **Scope unit.** Company-wide, one department, or one process at a time as the
   default a session targets? (I lean: one process at a time — smallest useful
   map, matches "one person one artifact"; they can start another.)
5. **Tie to nothing (confirm).** v0 stays standalone — no auto-handoff into
   HIRA. Confirm you want zero coupling for now.
