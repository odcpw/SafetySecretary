# Pass 10 Remaining Candidate Scan

Generated: 2026-06-18T21:34:21+02:00

## Method

Focused re-scan of pass-01 high-score candidates using `rg` against current `HEAD`.

Commands used:

```text
rg -n "ensureCsrfToken|getCsrfTokenFromCookie|csrfTokenFromCookie|csrf-token|ssfw_csrf|document\\.cookie|x-csrf-token" src/app src/components src/lib/auth -g '*.ts' -g '*.tsx'
rg -n "locale\\.split\\(\"-\"\\)\\[0\\]\\?\\.toLowerCase\\(\\) \\?\\? \"en\"|locale\\.split\\('-'\\)\\[0\\]\\?\\.toLowerCase\\(\\) \\?\\? 'en'|split\\(\"-\"\\).*toLowerCase|split\\('-'\\).*toLowerCase" src/components/incident src/lib/incident -g '*.ts' -g '*.tsx'
rg -n "operationGist|primaryText|payloadPrimaryText|title|label|statement|note|narrative|operation\\.payload as unknown as Record" src/components/incident/coach/CoachWorkbench.tsx src/lib/incident/coach-chat.ts src/lib/incident/coach-proposal-digest.ts
rg -n "function tr|const tr|return t\\(key, locale\\)|=> t\\(key, locale\\)|t\\(key, locale\\)" src/app/workspace/actions src/app/workspace/company/delete src/app/workspace/settings -g '*.tsx'
```

## Candidate Status

| ID | Pass-01 score | Current status | Next decision |
|---|---:|---|---|
| C2 | 5.0 | Partially handled only. Pass 3 removed invite server-action cookie-writer duplication, but local client `ensureCsrfToken` copies still remain in `LocaleSwitcher`, `VisionConsentModal`, `VisionToggle`, `DeleteCompanyButton`, invitations/members settings, `SubmitWithCsrfScript`, approval inline script, and disclaimer page. | Still above threshold, but security-sensitive. If reopened, do this as one narrow client-component subset with focused CSRF tests. Do not do a repo-wide sweep blindly. |
| C3 | 8.0 | Still present. The locale-base expression remains across seven incident coach/readiness files: `coach-consistency.ts`, `readiness.ts`, `CoachWorkbench.tsx`, `RecordPanel.tsx`, `CauseMethodToggle.tsx`, `FishboneGraph.tsx`, and `CauseGraph.tsx`. | Still above threshold and likely safe. Good future pass candidate after C2 or when next touching incident coach/readiness. |
| C4 | 4.0 | Still present as a Type III formatting/gist rhyme between `coach-chat`, `coach-proposal-digest`, and `CoachWorkbench`. The key order and operation-specific display behavior still differ. | Keep deferred until a visible-text contract or snapshot test pins exact digest output. Not a final-pass source change. |
| C6 | 2.0 | Still present as page-local `tr(key, locale) { return t(key, locale); }` wrappers in workspace action/settings pages. | Continue skipping. The score is threshold-only and the abstraction would add little value. |

## Score >= 2.0 Remaining

Remaining above-threshold candidates exist: C2 and C3. Therefore this loop stops by pass cap, not by zero-candidate convergence.

The final pass did not implement either candidate because the mission explicitly prioritized durable final artifacts and said not to introduce a new source-code refactor unless an artifact/progress inconsistency required it. No such inconsistency was found.
