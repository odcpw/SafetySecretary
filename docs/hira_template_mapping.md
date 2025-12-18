# HIRA Template SWP.xlsm → SafetySecretary Data Mapping

This document captures the concrete sheet/column structure in `HIRA Template SWP.xlsm` so exports can converge on a stable “good looks like” layout (`SafetySecretary-hsc.2`).

## Workbook sheets (from `xl/workbook.xml`)
- **Cover Page**: cover/meta.
- **Risk Assessment**: primary HIRA worksheet (table + embedded risk matrices).
- **Photos**: numbered photo slots (grid).
- **REFERENCES**: reference content.
- **Risk Profiles**: summary/analysis (not yet mapped).
- **Action Plan & Mgt Validation**: action plan + station management validation columns.
- **Liste** (hidden): lists for validation (severity/likelihood, etc.).

## Risk Assessment sheet (primary table)

### Print area / structure hints
- Print area: `A3:AC69` (named `_xlnm.Print_Area`).
- Header/title rows: `15:18` (named `_xlnm.Print_Titles`).
- Section headers appear on row 17; detailed column headers appear on row 18.

### Columns (row 18 headers)

#### Activity / step
- `A` **N°** → step index (1-based display).
- `B` **Description of activity, incl. equipment, tools, material, substances, etc.** → step activity + equipment/substances + notes.

#### Hazard identification
- `D` **Code** → hazard code/category (candidate mapping: `Hazard.categoryCode`).
- `E` **Type of hazard** → appears computed/locked (“Do not write in this cell!” in body); candidate: hazard taxonomy label derived from `categoryCode`.
- `F` **Description of the hazard** → candidate mapping: `Hazard.label` + `Hazard.description` (layout choice).
- `H` **Description of the potential consequences** → **missing field** in current model.
- `K` **Person at risk** → **missing field** in current model.

#### Existing requirements & controls
- `L` **Health & Safety Requirements (mandatory)** → candidate mapping: subset of `Hazard.existingControls` (if we later distinguish mandatory vs recommended).
- `P` **Other recommended preventive and control measures** → candidate mapping: remainder of `Hazard.existingControls` (or a new field if we split types).
- `S` **Effectiveness / contributing factors** (“HOW effective… locally? frequent contributing factors?”) → **missing field** in current model.

#### Baseline risk evaluation (current)
- `U` **Likelihood** → `Hazard.baseline.likelihood`
- `V` **Severity** → `Hazard.baseline.severity`
- `X` **Level of risk** → appears computed/locked (“Do not write in this cell!”); candidate: computed from severity×likelihood and/or matrix settings.

#### Risk mitigation
- `Y` **Recommendations of actions to MITIGATE the risks** → “headlines only”; candidate mapping: derived from actions (or free-text summary field).

#### Residual risk evaluation (target)
- `Z` **Likelihood** → `Hazard.residual.likelihood`
- `AA` **Severity** → `Hazard.residual.severity`
- `AC` **Level of risk** → appears computed/locked (“Do not write in this cell!”); candidate: computed as above.

#### Monitoring / review
- `AD` **Recommendation of control measures to MONITOR and REVIEW the residual risks** → **missing field** in current model.
- `AE` **Responsibility to monitor & review** → **missing field** in current model.

### Embedded risk matrices (headers around row 15+)
- “Current Matrix” starts at `AG15` with probability/severity labels below.
- “Target Matrix” starts at `BI15`.
- These appear to be visual helpers; exports can approximate with a computed matrix table and counts.

## Action Plan & Mgt Validation sheet

### Header rows
Row 8 provides column labels; row 9 provides clarifications.

### Columns (row 8 headers)
- `A` **Nr.** → action index.
- `B` **CURRENT level of risk** → baseline risk level (computed) for linked hazard.
- `C` **RECOMMENDATIONS** (mitigation / control measures) → candidate: `CorrectiveAction.description` (or a split “recommendation headline” field).
- `G` **TARGET level of risk** → residual risk level (computed) for linked hazard.
- `H` **RESOURCES NEEDED** → **missing field** in current model.
- `I` **MANAGEMENT DECISION** → **missing field** in current model (approval/validation).
- `J` **EXPLANATION / OTHER COMMENTS** → **missing field** in current model.
- `M` **First name / Surname** → candidate: `CorrectiveAction.owner` (currently single string).
- `N` **Date** → **missing field** in current model (management validation date).
- `O` **Signature** → **out of scope** for v1 exports unless using typed name.
- `P` **DEADLINE** → `CorrectiveAction.dueDate`
- `Q` **RESPONSIBLE** → `CorrectiveAction.owner` (or separate “responsible” field).
- `R` **STATUS** → `CorrectiveAction.status`

## Photos sheet
- Grid of numbered slots (1..50+), intended for embedded images.
- Candidate mapping for SafetySecretary:
  - case-level “Photos” section in exports, or
  - attachment thumbnails per step/hazard once attachment model + API are complete.

## Gaps vs current data model (to inform hsc.2 / future modeling)

Hazard-level gaps:
- potential consequences
- persons at risk
- effectiveness / contributing factors
- monitoring measures + responsibility
- (optional) split existing controls into mandatory vs recommended

Action-level gaps:
- resources needed
- management decision/validation fields
- management comments/signature/date

Case-level gaps:
- station/business unit + type of operation fields (candidate mapping: `location`, `team`, `activityName`, plus a new `operationType` field).

