# Pass 01 Candidate Map

Score formula used for ranking: `(LOC saved 1-5 * confidence 1-5) / risk 1-5`

## Ranked candidates

| Rank | ID | Candidate | Score | LOC | Confidence | Risk | Likely files | Passes 2-10? | Why |
|---:|---|---|---:|---:|---:|---:|---|---|---|
| 1 | C1 | Collapse duplicated provider send bodies in transactional email transport | 8.0 | 4 | 4 | 2 | `src/lib/email/transport.ts` | Yes, pass 2 | Resend, Postmark, and Mailgun each duplicate `sendMagicLink` / `sendInvitation` structure with only provider field names and content helpers changing. This is the clearest Type II clone in scope and matches the loop's pass-2 mission. |
| 2 | C2 | Replace remaining local client CSRF cookie readers with the existing shared helper | 5.0 | 3 | 5 | 3 | `src/lib/auth/csrf-client.ts`, `src/app/workspace/settings/invitations/page.tsx`, `src/app/workspace/settings/vision/VisionToggle.tsx`, `src/app/workspace/settings/members/RemoveMemberButton.tsx`, `src/app/workspace/company/delete/DeleteCompanyButton.tsx`, `src/components/incident/VisionConsentModal.tsx`, `src/components/ui/LocaleSwitcher.tsx`, `src/components/forms/SubmitWithCsrfScript.tsx`, `src/app/incidents/[id]/approval/page.tsx`, `src/app/disclaimer/page.tsx` | Yes, staged in pass 3 or pass 8 | `census_ensureCsrfToken.md` shows the shared helper already exists and the duplicated local copies are bounded. Security sensitivity raises risk, so this should be done as a small, test-backed subset rather than a repo-wide sweep. |
| 3 | C3 | Extract locale-base normalization helper for coach/readiness surfaces | 8.0 | 2 | 4 | 1 | `src/components/incident/coach/CauseMethodToggle.tsx`, `src/components/incident/coach/CauseGraph.tsx`, `src/components/incident/coach/FishboneGraph.tsx`, `src/components/incident/coach/RecordPanel.tsx`, `src/components/incident/coach/CoachWorkbench.tsx`, `src/lib/incident/readiness.ts`, `src/lib/incident/coach-consistency.ts` | Yes, pass 8 | The exact `locale.split("-")[0]?.toLowerCase() ?? "en"` pattern repeats across seven files. This is a low-rung extraction with narrow semantics and low blast radius. |
| 4 | C4 | Unify repeated operation-gist / payload-primary-text extraction | 4.0 | 2 | 4 | 2 | `src/components/incident/coach/CoachWorkbench.tsx`, `src/lib/incident/coach-chat.ts`, `src/lib/incident/coach-proposal-digest.ts` | Yes, pass 7 | These files repeat the same `operation.payload as unknown as Record<string, unknown>` cast and similar fallback key walks (`title`, `label`, `statement`, `note`, `text`, `narrative`, `value`). This is a good type-surface shrink candidate once the exact observable text contract is written down. |
| 5 | C5 | Internal helper extraction inside Flue proposal builder file | 3.0 | 3 | 3 | 3 | `src/lib/incident/coach-flue-operation-tools.ts` | Yes, pass 5 | Four builder entrypoints share `errors` + `operations` accumulation and the same `proposalResult({ errors, operations })` exit. Worth doing only after proving the per-builder validation and "at least one ..." messages stay untouched. |
| 6 | C6 | Collapse ad hoc settings/action page `return t(key, locale)` wrappers | 2.0 | 1 | 4 | 2 | `src/app/workspace/actions/page.tsx`, `src/app/workspace/actions/[id]/page.tsx`, `src/app/workspace/actions/new/page.tsx`, `src/app/workspace/company/delete/page.tsx`, `src/app/workspace/settings/vision/page.tsx`, `src/app/workspace/settings/danger-zone/page.tsx`, `src/app/workspace/settings/members/page.tsx` | No, not worth early passes | The shape repeats, but the LOC win is tiny and it does not remove meaningful complexity. Leave it unless a later pass is already editing those files for stronger reasons. |

## Candidate notes

### C1

- Evidence: `src/lib/email/transport.ts`
- Clone type: Type II parametric clone
- Safe boundary: keep provider-specific payload field names and auth headers local; only extract common content selection or request shell where identical
- Required proof: `pnpm test:auth:last-user` plus targeted invite/magic-link transport tests if added

### C2

- Evidence: `census_ensureCsrfToken.md` plus direct scans showing duplicated local implementations next to the existing shared helper
- Clone type: Type I / II
- Risk driver: auth-bearing client flows and one inline script path
- Recommended approach: start with React client components already behaving like `src/lib/auth/csrf-client.ts`; leave the approval/disclaimer inline scripts for a separate bounded proof if necessary

### C3

- Evidence: repeated locale-base pattern in coach/readiness files
- Clone type: Type I exact clone
- Recommended landing zone: a tiny helper under `src/lib/incident` or existing coach utility file, not a new generic "utils" module

### C4

- Evidence: `CoachWorkbench.primaryText`, `coach-chat.operationGist`, and `coach-proposal-digest.operationGist`
- Clone type: Type III bounded gapped clone
- Risk driver: slight differences in truncation, key order, and field-specific handling for `incident_field_update`
- Recommended approach: extract only the shared payload key probing first, then keep per-callsite formatting local

### C5

- Evidence: `census_proposalResult.md` and repeated `cleanText(...)` / `proposalResult(...)` scaffolding in `coach-flue-operation-tools.ts`
- Clone type: Type III gapped clone
- Risk driver: validation error wording and operation ordering are user-visible through tests
- Recommended approach: confine the refactor to a single file and preserve each builder's final error message verbatim

## Implementation order recommendation

1. C1
2. C2 as a narrow subset, not a repo-wide sweep
3. C5
4. C4
5. C3
6. Skip C6 unless touched for another reason
