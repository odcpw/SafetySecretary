# Incident Investigation Skill v0

Status: v0.1.0 implementation contract for `ssfw-1fe`.

The Incident Investigation skill is one product-facing workbench coach, not a
set of user-visible micro-skills. Internally it covers intake, facts,
timeline/story, cause analysis, STOP actions, HIRA follow-up, and output
drafting.

## Entry Conditions

- Workflow type is `II`.
- Surface is the incident investigation workbench.
- An incident list entry exists, or the user is in quick capture while creating
  one.
- The official record remains manually editable.
- The skill only asks questions and proposes reviewable structured operations.
- Evidence and photos are available as references only; photo bytes are not
  passed in the context.

## Allowed Context

The skill may read these context sections when present:

- `incident`, `basics`, or `triage` for case header and risk posture.
- `people` and `accounts` for involved people and free-text statements.
- `facts` for accepted facts.
- `timeline` for before/event/after story structure.
- `causes` for contributing cause cards or tree nodes.
- `actions` for S-T-O-P action state.
- `hiraFollowup` for Phase 1 risk-assessment follow-up notes.
- `outputs` and generated artifact metadata for report / comms drafting.

## Methodology References

- `docs/methodology-pack.md#ii-incident-investigation-data-shape`
- `docs/methodology-pack.md#ii-analytics-fields`
- `docs/mockups/incident-investigation-flow-review.md`
- `SPEC.md#ii-incident-investigation`
- `PLAN.md#phase-1--ii-incident-investigation-first`

## Questions It Should Ask

The skill asks enough practical questions to build a good story without making a
small event feel like a court case:

- what happened in normal words;
- where exactly it happened;
- what the person was doing and where they were going;
- what the cable, truck, machine, substance, or setup was doing there;
- what changed before and after the event;
- what the credible worst realistic outcome was;
- likelihood only when the II matrix posture is enabled, using the 1000-people
  mental model;
- what else contributed: equipment, workplace layout, planning, time pressure,
  training, communication, or a control that was missing or not used.

## Structured Operations

The skill may emit only reviewable operations:

- `ask_question`
- `fact`
- `timeline_event`
- `cause_node`
- `stop_action`
- `hira_followup_note`
- `output_section_draft`

All operations use `ask-only` or `propose` confirmation. They target only
`conversation`, `workflow_draft`, or `generated_artifact_draft`.

## Forbidden Actions

The skill must not:

- approve, sign off, create snapshots, close actions, delete evidence, or change
  privacy/provider/language settings;
- silently mutate the official incident record;
- expose intake/facts/timeline/causes/actions as separate skills to users;
- treat actual injury outcome as potential severity;
- declare one root cause just because one branch is filled;
- require exactly one cause branch.

## Synthetic Fixtures

The fixture suite covers:

- a small low-harm event;
- a serious-potential near miss;
- a property-damage event with serious potential;
- a multi-cause incident.

All fixture names, sites, and incidents are synthetic. They contain no real
company data, no real incidents, and no photo bytes.

## Version Tag

`incident-investigation@0.1.0`
