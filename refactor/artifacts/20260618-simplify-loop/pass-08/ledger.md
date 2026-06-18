# Pass 08 Ledger

## Accepted Candidate

| Candidate | Type | LOC | Confidence | Risk | Score | Decision |
|---|---|---:|---:|---:|---:|---|
| File-local detail row renderer for `StructuredOperationReview` summary and traceability lists | Type I/II local JSX clone | 1 | 5 | 1 | 5.0 | PRODUCTIVE |

## Source Delta

| Path | Insertions | Deletions | Net |
|---|---:|---:|---:|
| `src/components/agent/StructuredOperationReview.tsx` | 29 | 30 | -1 |

## Rejected Or Already-Correct Candidates

| Candidate | Files checked | Decision | Reason |
|---|---|---|---|
| Shared coach editor button/input class constants | `ActionPlanEditor.tsx`, `TimelineEditor.tsx`, `CauseTreeEditor.tsx`, `OverviewEditor.tsx`, `PhotosTab.tsx` | Rejected | The repetition is real, but sharing it would introduce a new cross-file style module in the coach package. Several variants differ by text size, textarea sizing, and danger/primary availability, so this is a Type III/V boundary better handled by an existing design-system pattern if one appears. |
| Empty/error panel component | `PhotosTab.tsx`, `ActionPlanEditor.tsx`, `TimelineEditor.tsx`, `CauseTreeEditor.tsx`, `OverviewEditor.tsx`, `CoachWorkbench.tsx` | Rejected | The classes rhyme, but each panel is tied to different state, placement, and copy. No single file had 3+ identical empty/error blocks with the same semantics. |
| Resizable split-pane helper | `CoachWorkbench.tsx`, `TableChatLayout.tsx` | Rejected | Both are split layouts, but one is the coach conversation/record workbench and the other is a generic table-chat shell. Pointer direction, min-size rules, ARIA roles, and collapse behavior differ enough to make this Type V. |
| Layout helper extraction | `TableChatLayout.tsx`, `InspectorPanel.tsx` | Already correct | Both files already keep their class/cx helpers file-local and do not duplicate 3+ same-shape sections inside the file. |
| Locale-base helper from pass-01 C3 | `RecordPanel.tsx`, `CoachWorkbench.tsx`, graph components, incident libraries | Deferred | This is a valid low-rung candidate from pass 01, but it is not a UI/layout helper duplication in this pass and crosses into incident library code. |
