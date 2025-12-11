# SafetySecretary HIRA Alignment Plan

## Core Vision

**HIRA is fundamentally a TABLE** - like the Excel template. The LLM is an enhancement that helps users fill the table using natural language, not a gatekeeper that locks data.

**Key Principles:**
1. **Everything editable, always** - User can modify any cell at any time
2. **Phases are column views** - Each "phase" shows a subset of columns, not a locked workflow step
3. **Iterative refinement** - "Oh I forgot the ladder in step 3", "Actually there's another step between 3 and 4"
4. **LLM as assistant** - Global text box that intelligently updates any part of the table based on context

**Language**: English throughout.

---

## The HIRA Table Model

The entire HIRA is ONE TABLE with these column groups:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         THE HIRA TABLE                                                          │
├──────────────────┬──────────────────┬──────────────────┬──────────────────┬──────────────────┬──────────────────┤
│   PROCESS        │    HAZARDS       │  BASELINE RISK   │    CONTROLS      │  RESIDUAL RISK   │   ACTIONS        │
│   (Col A-C)      │    (Col D-F)     │    (Col G-I)     │    (Col J-L)     │    (Col M-O)     │   (Col P-R)      │
├──────────────────┼──────────────────┼──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ • Step #         │ • Hazard label   │ • Severity       │ • Existing       │ • Severity       │ • Action item    │
│ • Activity       │ • Description    │ • Likelihood     │ • Proposed       │ • Likelihood     │ • Owner          │
│ • Equipment      │ • Category       │ • Risk rating    │ • Hierarchy      │ • Risk rating    │ • Due date       │
│ • Substances     │                  │                  │   (S-T-O-P)      │                  │ • Status         │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

**Phases = Column Views:**
- Phase "Process Steps" → Shows columns A-C
- Phase "Hazard ID" → Shows columns A-F (process context + hazards)
- Phase "Risk Rating" → Shows columns D-I (hazards + baseline assessment)
- Phase "Controls" → Shows columns D-L (hazards + controls)
- Phase "Residual" → Shows columns D-O (hazards + controls + residual)
- Phase "Actions" → Shows columns J-R (controls + actions)

**View Modes:**
1. **Phase View** - Filtered columns for focused workflow
2. **Workspace View** - Full table with all columns visible (highlight/scroll to relevant)

---

## Hazard Categories (Reference Taxonomy - English)

13 categories from SUVA, used to classify hazards:

| # | Category | Examples |
|---|----------|----------|
| 1 | Mechanical | Moving parts, sharp edges, falling objects, pressurized systems |
| 2 | Falls | Working at height, slippery surfaces, obstacles, poor visibility |
| 3 | Electrical | Live parts, static discharge, short circuits, arcs |
| 4 | Hazardous Substances | Toxic/corrosive chemicals, biological agents, dusts |
| 5 | Fire & Explosion | Flammable materials, ignition sources, explosive atmospheres |
| 6 | Thermal | Hot/cold surfaces, flames, steam, splashes |
| 7 | Physical | Noise, radiation (UV, laser, X-ray), pressure changes |
| 8 | Environmental | Climate, lighting, air quality |
| 9 | Ergonomic | Posture, lifting, repetitive motion, vibration |
| 10 | Psychological | Stress, overload, isolation, harassment |
| 11 | Control Failures | System malfunctions, unexpected machine behavior |
| 12 | Power Failure | Outages, interruptions |
| 13 | Organizational | Training gaps, unclear procedures, communication failures |

### S-T-O-P Control Hierarchy
When defining controls, classify by effectiveness (highest to lowest):

- **S** - Substitution: Replace the hazard entirely
- **T** - Technical: Engineering controls (guards, ventilation, barriers)
- **O** - Organizational: Procedures, training, supervision, scheduling
- **P** - PPE: Personal protective equipment (last resort)

---

## Implementation Plan

### Phase 1: Database Schema Updates

**1.1 Enhance ProcessStep Model**

Current ProcessStep has only `title` and `description`. Enhance to capture the triad:

```prisma
model ProcessStep {
  id          String   @id @default(cuid())
  caseId      String
  orderIndex  Int

  activity    String      // What is being done
  equipment   String[]    // Tools/equipment used
  substances  String[]    // Materials/substances involved
  description String?     // Additional context

  case        RiskAssessmentCase @relation(...)
  hazardSteps HazardStep[]
}
```

**1.2 Update Hazard Model - Include Existing Controls**

Key insight: Existing controls are captured WITH the hazard during identification, not separately.

```prisma
model Hazard {
  id              String   @id @default(cuid())
  caseId          String
  label           String              // Human-readable hazard name
  description     String?             // What can happen / past incidents
  categoryCode    String?             // e.g., "MECHANICAL", "FALL"

  // Existing controls captured during hazard identification
  existingControls String[]           // What rules/controls are already in place

  case            RiskAssessmentCase @relation(...)
  hazardSteps     HazardStep[]
  assessments     HazardAssessment[]
  proposedControls HazardControl[]    // NEW controls from discussion phase
}
```

**1.3 Update HazardControl - For Proposed Controls Only**

```prisma
model HazardControl {
  id          String   @id @default(cuid())
  hazardId    String
  description String
  hierarchy   ControlHierarchy?  // S-T-O-P classification

  hazard      Hazard @relation(...)
}

enum ControlHierarchy {
  SUBSTITUTION
  TECHNICAL
  ORGANIZATIONAL
  PPE
}
```

**1.4 Hazard Categories as Static Data**

Categories stored as constants (not DB tables) since they're reference data:

```typescript
// src/lib/hazardCategories.ts
export const HAZARD_CATEGORIES = [
  { code: 'MECHANICAL', label: 'Mechanical', examples: ['Moving parts', 'Sharp edges', 'Falling objects'] },
  { code: 'FALLS', label: 'Falls', examples: ['Working at height', 'Slippery surfaces'] },
  // ... 13 total
];
```

### Phase 2: Update App Phases

Map new flow to phases:

| Phase | Purpose | UI Focus |
|-------|---------|----------|
| PROCESS_STEPS | Describe process | Guide user to provide activity + equipment + substances |
| HAZARD_IDENTIFICATION | Identify hazards per step | For each step: what can happen + existing controls |
| RISK_RATING | Baseline assessment | Rate risk based on adherence to existing controls |
| CONTROL_DISCUSSION | Discuss improvements | Free-form discussion, LLM suggests controls |
| ACTIONS | Action plan | LLM structures controls into owner/deadline/status |
| RESIDUAL_RISK | Target assessment | Rate risk after proposed controls implemented |

### Phase 3: Frontend UX Overhaul

**3.0 Global LLM Input (Top of Every View)**

The key UX element - a persistent text box at the top:

```
┌─────────────────────────────────────────────────────────────────┐
│ Add or update anything...                                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ "Oh I forgot - we also use a ladder in step 3"              │ │
│ │ "The slip incident was actually due to tools lying around"  │ │
│ │ "Insert a step between 3 and 4: cleaning the work area"     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                              [Update Table]     │
└─────────────────────────────────────────────────────────────────┘
```

LLM parses the natural language and:
- Identifies WHAT to update (step, hazard, control, rating, action)
- Identifies WHERE (which row/cell)
- Applies the update to the database
- Shows user a preview/diff before confirming

**3.1 View Switcher**

Navigation bar with two modes:

```
┌──────────────────────────────────────────────────────────────┐
│  [Guided]  Steps → Hazards → Rating → Controls → Actions     │
│  [Workspace] Full Table | Risk Matrix | Action Plan          │
└──────────────────────────────────────────────────────────────┘
```

- **Guided Mode**: Phase tabs that filter columns (current behavior, improved)
- **Workspace Mode**: Full table view with all columns, plus specialized views

**3.2 Guided Phase Views (Filtered Columns)**

Each phase shows relevant columns only, but ALL DATA IS EDITABLE:

| Phase | Columns Shown | Focus |
|-------|--------------|-------|
| Process Steps | Step#, Activity, Equipment, Substances | Define the work |
| Hazard ID | Step context + Hazard, Description, Category, Existing Controls | Identify risks |
| Risk Rating | Hazard + Existing Controls + Severity, Likelihood, Rating | Assess baseline |
| Controls | Hazard + Existing + Proposed Controls (S-T-O-P) | Improve safety |
| Residual | Hazard + All Controls + Residual Severity/Likelihood/Rating | Verify improvement |
| Actions | Controls + Action, Owner, Due, Status | Assign work |

**3.3 Workspace Views**

- **Full Table**: Scrollable spreadsheet with all columns, Excel-like
- **Risk Matrix**: 5×4 grid showing hazard distribution
- **Action Plan**: Filtered to controls/actions columns, Kanban-optional

**3.4 Inline Editing**

ALL cells are directly editable (click to edit):
- Text cells: inline text input
- Dropdowns: severity, likelihood, category, S-T-O-P hierarchy
- Multi-value: equipment[], substances[], existingControls[]
- Add/delete rows at any point

### Phase 4: LLM Contextual Update System

**The Core LLM Capability: Parse & Route Updates**

User types natural language → LLM determines:
1. **Intent**: Add, modify, delete, or insert
2. **Target**: Which table entity (step, hazard, control, assessment, action)
3. **Location**: Which specific row(s) to affect
4. **Data**: Structured values to apply

**Example LLM Prompt (Contextual Update):**

```
You are helping update a HIRA (Hazard Identification & Risk Assessment) table.

CURRENT TABLE STATE:
[JSON of current steps, hazards, controls, assessments, actions]

USER INPUT:
"{user's natural language}"

TASK:
Parse the user's input and return a structured update command:

{
  "intent": "add" | "modify" | "delete" | "insert",
  "target": "step" | "hazard" | "control" | "assessment" | "action",
  "location": {
    "stepId": "...",      // if applicable
    "hazardId": "...",    // if applicable
    "insertAfter": "..."  // for insert operations
  },
  "data": {
    // Structured data for the update
  },
  "explanation": "Human-readable summary of what will change"
}

EXAMPLES:
- "We also use a ladder in step 3" → modify step 3, add "Ladder" to equipment[]
- "Insert cleaning step between 3 and 4" → insert new step after step 3
- "The slip was due to tools on floor" → modify existing hazard description or add new hazard
- "Mark the guardrail action as complete" → modify action status
```

**Phase-Specific Prompt Hints:**

When user is in a specific phase view, bias LLM toward that domain:
- In "Process Steps" view → favor step/equipment/substance updates
- In "Hazard ID" view → favor hazard/existingControl updates
- In "Risk Rating" view → favor assessment updates
- In "Controls" view → favor proposedControl updates
- In "Actions" view → favor action updates

---

## Files to Modify

### Database
- `prisma/schema.prisma` - Enhanced ProcessStep, updated Hazard (with existingControls), ControlHierarchy enum

### Backend
- `src/types.ts` - TypeScript types
- `src/routes/raCasesRouter.ts` - Updated endpoints for new data structure
- `src/services/llmService.ts` - Updated prompts for triad extraction, hazard+controls, control suggestions

### Frontend (key files)
- `frontend/src/lib/phases.ts` - Rename/update phase definitions
- `frontend/src/lib/hazardCategories.ts` (new) - 13 category constants
- `frontend/src/components/phases/PhaseProcessSteps.tsx` - Triad extraction UI
- `frontend/src/components/phases/PhaseHazardNarrative.tsx` - Hazard + existing controls input
- `frontend/src/components/phases/PhaseRiskRating.tsx` - Show existing controls, assess adherence
- `frontend/src/components/phases/PhaseControls.tsx` - Rename to PhaseControlDiscussion, chat-like UI
- `frontend/src/components/phases/PhaseControlsActions.tsx` - Action plan table

---

## Summary

**The Vision:**
HIRA is a TABLE. The LLM helps fill it using natural language. Everything is editable, always.

**The Mental Model:**
- One big table with columns: Process | Hazards | Baseline Risk | Controls | Residual Risk | Actions
- "Phases" = column filters (views), NOT workflow gates
- Global LLM input parses natural language into structured table updates
- User can add/modify/delete at any point: "forgot the ladder", "insert step between 3 and 4"

**Two View Modes:**
1. **Guided Mode** - Phase tabs filter columns, suggest what to focus on
2. **Workspace Mode** - Full table, risk matrix, action plan views

**Key Changes from Current Implementation:**
1. Remove read-only restrictions - ALL cells editable in ALL views
2. Add global LLM input box (persistent at top of every view)
3. Add view mode switcher (Guided vs Workspace)
4. Add workspace views (Full Table, Risk Matrix, Action Plan)
5. Update LLM to parse contextual updates (not just extraction)
6. Phase navigation becomes suggestion, not enforcement

**Implementation Priority:**
1. Make all fields editable (quick win, removes restrictions)
2. Add global LLM input with contextual update parsing
3. Add Workspace mode with full table view
4. Add Risk Matrix view
5. Polish inline editing UX
