# Callsite census — `causeMethodLabel`

Run: 20260618-simplify-loop/pass-01
Generated: 2026-06-18T13:38:49Z


## Source code — word-boundary match

3 hit(s):

```
src/components/incident/coach/CoachWorkbench.tsx:32:import { causeMethodLabel } from "./CauseMethodToggle";
src/components/incident/coach/CoachWorkbench.tsx:865:	return build(causeMethodLabel(method, locale));
src/components/incident/coach/CauseMethodToggle.tsx:58:export function causeMethodLabel(method: string, locale: string): string {
```

## Imports of this symbol

3 hit(s):

```
src/components/incident/coach/CoachWorkbench.tsx:32:import { causeMethodLabel } from "./CauseMethodToggle";
src/components/incident/coach/CoachWorkbench.tsx:865:	return build(causeMethodLabel(method, locale));
src/components/incident/coach/CauseMethodToggle.tsx:58:export function causeMethodLabel(method: string, locale: string): string {
```

## String literal references

_no hits_

## Tests

_no hits_

## Build files

_no hits_

## CI / workflows

_no hits_

## Config / env

_no hits_

## Docs

7 hit(s):

```
refactor/artifacts/20260618-simplify-loop/pass-01/census_causeMethodLabel.md:1:# Callsite census — `causeMethodLabel`
refactor/artifacts/20260618-simplify-loop/pass-01/census_causeMethodLabel.md:12:src/components/incident/coach/CoachWorkbench.tsx:32:import { causeMethodLabel } from "./CauseMethodToggle";
refactor/artifacts/20260618-simplify-loop/pass-01/census_causeMethodLabel.md:13:src/components/incident/coach/CoachWorkbench.tsx:865:	return build(causeMethodLabel(method, locale));
refactor/artifacts/20260618-simplify-loop/pass-01/census_causeMethodLabel.md:14:src/components/incident/coach/CauseMethodToggle.tsx:58:export function causeMethodLabel(method: string, locale: string): string {
refactor/artifacts/20260618-simplify-loop/pass-01/census_causeMethodLabel.md:22:src/components/incident/coach/CoachWorkbench.tsx:32:import { causeMethodLabel } from "./CauseMethodToggle";
refactor/artifacts/20260618-simplify-loop/pass-01/census_causeMethodLabel.md:23:src/components/incident/coach/CoachWorkbench.tsx:865:	return build(causeMethodLabel(method, locale));
refactor/artifacts/20260618-simplify-loop/pass-01/census_causeMethodLabel.md:24:src/components/incident/coach/CauseMethodToggle.tsx:58:export function causeMethodLabel(method: string, locale: string): string {
```

## Per-file impact

files touched by this symbol:

| file | hits |
|------|------|
| `src/components/incident/coach/CoachWorkbench.tsx` | 2 |
| `src/components/incident/coach/CauseMethodToggle.tsx` | 1 |

## Summary

Symbol: `causeMethodLabel`

| Metric | Count |
|--------|-------|
| Total source hits | 3 |
| Unique source files | 2 |

**Narrowly-used**: ≤3 files. Tier-1 refactor safe.
