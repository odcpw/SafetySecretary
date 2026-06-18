# Pass 09 dead-code safety ledger

## Candidate 1: `incident.tab.placeholder`

Decision: PRODUCTIVE. Removed the symbol entry only.

| Step | Result | Notes |
|------|--------|-------|
| 1 source refs | 0 live refs | Before edit, exact key hits were only the four locale catalogs and `MESSAGE_KEYS`. |
| 2 dynamic refs | 0 | Fixed-string dynamic composition check for `incident.tab.${` returned zero hits; prefix search found no constructed `incident.tab.*` key outside catalogs/types. |
| 3 string/config refs | 0 live refs | Exact visible values `Coming in`, `Kommt in`, `Arrive dans`, and `Arriva in` appeared only on the candidate catalog rows. |
| 4 test refs | 0 | No tests named the key or visible strings. `tests/unit/i18n/t.test.ts` validates catalog parity through `MESSAGE_KEYS`, so removing all five rows together preserves the catalog contract. |
| 5 build refs | 0 | `package.json`, `tsconfig.json`, and `.env.example` had no key refs. |
| 6 feature flag refs | 0 | No env/config flag references for this key. |
| 7 doc refs | 0 | Docs search found no `incident.tab.placeholder` or visible-string references. |
| 8 git history | low intent signal | `git log -S'incident.tab.placeholder' -- ...` points to `eba1655 Safety Secretary - incident-investigation coach`, the initial incident i18n batch. No later commit touched or wired this key. |
| 9 companion tests/docs | none | i18n companion test checks catalog shape, not this key as a required product placeholder. |
| 10 naming signal | weak but not blocking | `placeholder` can imply intended future UI, but no source/docs/tests/config path uses this particular tab placeholder key. |
| 11 owner check | N/A | Symbol-entry removal only; no file deletion or staged delete. Evidence is recorded here for review. |
| 12 explicit delete approval | N/A | User authorized this pass to remove this specific key if proven dead; no file deletion performed. |

## Candidate 2: `src/lib/incident/coach-pi-runtime.ts`

Decision: REJECTED. Do not remove.

Evidence:

- `src/lib/incident/coach-chat.ts` imports `PiCoachProvider` from `./coach-pi-runtime`.
- `coachDispatchOptionsFromEnv()` creates `new PiCoachProvider({ env })` when `SSFW_II_COACH_RUNTIME=pi` and `OPENAI_API_KEY` is present.
- `shouldUseFlueCoachRuntime()` intentionally opts out of Flue when dispatch options exist or when runtime selection is not `flue`.
- `.env.example`, `docs/dev/coach-chat.md`, and `tests/integration/incidents/coach-chat.test.ts` document or exercise the `SSFW_II_COACH_RUNTIME` runtime selection surface.

Gauntlet conclusion: source refs, config/docs/tests, and explicit comments all show this file is a live fallback/direct runtime path, not dead code.

## Candidate 3: placeholder/settings/HIRA surfaces

Decision: REJECTED. Do not remove.

Evidence:

- `src/lib/settings/registry.ts` defines `placeholderTitle` and `placeholderBody` as part of `SettingsContentModel`.
- `src/app/workspace/settings/page.tsx` and `src/app/workspace/settings/danger-zone/page.tsx` render those fields.
- `tests/integration/settings/shell.test.ts` asserts that settings entry pages render the placeholder title and body.
- `src/content/docs/incident-investigation.md` intentionally describes HIRA follow-up placeholder behavior.
- `tests/integration/incidents/hira-followup.test.ts` names and verifies the II HIRA-followup placeholder route behavior.
- `tests/unit/agent/structured-operation-review.test.ts` asserts generic HIRA operation kinds render domain content instead of a generic placeholder.

Gauntlet conclusion: these placeholders encode current visible behavior, terminology, or test intent. Removing them would be a product change, not dead-code cleanup.
