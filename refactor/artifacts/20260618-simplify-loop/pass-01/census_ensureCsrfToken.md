# Callsite census — `ensureCsrfToken`

Run: 20260618-simplify-loop/pass-01
Generated: 2026-06-18T13:38:49Z


## Source code — word-boundary match

68 hit(s):

```
src/components/ui/LanguageDropdown.tsx:6:import { ensureCsrfToken } from "../../lib/auth/csrf-client";
src/components/ui/LanguageDropdown.tsx:70:						[CSRF_HEADER_NAME]: ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/forms/SubmitWithCsrfScript.tsx:50:		csrfToken = ensureCsrfToken(form.dataset.csrfCookie || "ssfw_csrf");
src/components/forms/SubmitWithCsrfScript.tsx:141:function ensureCsrfToken(name: string): string {
tests/integration/incidents/vision-consent.test.ts:662:	// The vision components read a session-bound CSRF cookie via ensureCsrfToken
src/app/workspace/settings/vision/VisionToggle.tsx:35:			const csrfToken = ensureCsrfToken(csrfCookieName);
src/app/workspace/settings/vision/VisionToggle.tsx:98:function ensureCsrfToken(name: string): string {
src/lib/auth/csrf-client.ts:11:export function ensureCsrfToken(name: string): string {
src/app/workspace/settings/invitations/page.tsx:62:			const csrfToken = ensureCsrfToken(csrfCookieName);
src/app/workspace/settings/invitations/page.tsx:201:function ensureCsrfToken(cookieName: string): string {
src/app/workspace/settings/members/RemoveMemberButton.tsx:31:			const csrfToken = ensureCsrfToken(csrfCookieName);
src/app/workspace/settings/members/RemoveMemberButton.tsx:83:function ensureCsrfToken(name: string): string {
src/components/incident/IncidentRowMenu.tsx:6:import { ensureCsrfToken } from "../../lib/auth/csrf-client";
src/components/incident/IncidentRowMenu.tsx:89:					"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/ui/LocaleSwitcher.tsx:57:			const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
src/components/ui/LocaleSwitcher.tsx:113:function ensureCsrfToken(name: string): string {
src/components/incident/coach/OverviewEditor.tsx:6:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/OverviewEditor.tsx:213:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/incident/coach/CoachWorkbench.tsx:13:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/CoachWorkbench.tsx:334:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/incident/coach/CoachWorkbench.tsx:405:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/incident/coach/CoachWorkbench.tsx:516:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/incident/coach/CauseTreeEditor.tsx:11:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/CauseTreeEditor.tsx:161:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/incident/coach/TimelineEditor.tsx:5:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/TimelineEditor.tsx:99:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/incident/coach/ActionPlanEditor.tsx:5:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/ActionPlanEditor.tsx:114:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/app/workspace/company/delete/DeleteCompanyButton.tsx:38:			const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
src/app/workspace/company/delete/DeleteCompanyButton.tsx:94:function ensureCsrfToken(name: string): string {
src/app/findings/audit-inspection/AuditInspectionCaptureClient.tsx:10:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/app/findings/audit-inspection/AuditInspectionCaptureClient.tsx:162:				headers: { "x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME) },
src/app/findings/safety-walk/SafetyWalkCaptureClient.tsx:10:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/app/findings/safety-walk/SafetyWalkCaptureClient.tsx:77:				headers: { "x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME) },
src/app/workspace/actions/ActionFormClient.tsx:29:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/app/workspace/actions/ActionFormClient.tsx:695:	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
src/app/workspace/actions/ActionFormClient.tsx:725:	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
src/app/workspace/actions/ActionFormClient.tsx:751:	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
src/app/workspace/actions/ActionFormClient.tsx:778:	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
src/app/incidents/[id]/approval/page.tsx:57:	function ensureCsrfToken(name) {
src/app/incidents/[id]/approval/page.tsx:86:				csrfToken = ensureCsrfToken(csrfCookieName);
src/app/disclaimer/page.tsx:36:      const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
src/app/disclaimer/page.tsx:109:function ensureCsrfToken(name: string): string {
src/components/incident/coach/CauseGraph.tsx:5:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/CauseGraph.tsx:271:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/incident/coach/PhotosTab.tsx:6:import { ensureCsrfToken } from "../VisionConsentModal";
src/components/incident/coach/PhotosTab.tsx:59:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/incident/NewIncidentButton.tsx:6:import { ensureCsrfToken } from "../../lib/auth/csrf-client";
src/components/incident/NewIncidentButton.tsx:35:					"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/incident/coach/CauseMethodToggle.tsx:5:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/CauseMethodToggle.tsx:101:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/app/workspace/chemicals/ChemicalProfilesClient.tsx:13:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/app/workspace/chemicals/ChemicalProfilesClient.tsx:791:	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
src/app/workspace/chemicals/ChemicalProfilesClient.tsx:828:	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
src/app/workspace/chemicals/ChemicalProfilesClient.tsx:856:	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
src/app/workspace/chemicals/ChemicalProfilesClient.tsx:889:	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
src/components/incident/IncidentVisionAction.tsx:7:	ensureCsrfToken,
src/components/incident/IncidentVisionAction.tsx:80:			const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
src/components/incident/coach/PushToTalkButton.tsx:5:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/PushToTalkButton.tsx:82:						headers: { "x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME) },
src/components/incident/VisionConsentModal.tsx:58:			const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
src/components/incident/VisionConsentModal.tsx:166:export function ensureCsrfToken(name: string): string {
src/components/incident/coach/PhotoStrip.tsx:9:	ensureCsrfToken,
src/components/incident/coach/PhotoStrip.tsx:74:					headers: { "x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME) },
src/components/incident/coach/PhotoStrip.tsx:107:				"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/incident/coach/PhotoStrip.tsx:149:									"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/incident/coach/StatusControls.tsx:6:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/StatusControls.tsx:84:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
```

## Imports of this symbol

20 hit(s):

```
src/components/ui/LanguageDropdown.tsx:6:import { ensureCsrfToken } from "../../lib/auth/csrf-client";
src/app/workspace/chemicals/ChemicalProfilesClient.tsx:13:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/IncidentRowMenu.tsx:6:import { ensureCsrfToken } from "../../lib/auth/csrf-client";
src/app/workspace/actions/ActionFormClient.tsx:29:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/OverviewEditor.tsx:6:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/CoachWorkbench.tsx:13:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/CauseTreeEditor.tsx:11:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/CauseTreeEditor.tsx:161:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/incident/coach/TimelineEditor.tsx:5:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/ActionPlanEditor.tsx:5:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/StatusControls.tsx:6:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/app/findings/audit-inspection/AuditInspectionCaptureClient.tsx:10:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/app/findings/safety-walk/SafetyWalkCaptureClient.tsx:10:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/PushToTalkButton.tsx:5:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/PhotosTab.tsx:6:import { ensureCsrfToken } from "../VisionConsentModal";
src/components/incident/coach/CauseMethodToggle.tsx:5:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/CauseMethodToggle.tsx:101:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/incident/coach/CauseGraph.tsx:5:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
src/components/incident/coach/CauseGraph.tsx:271:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
src/components/incident/NewIncidentButton.tsx:6:import { ensureCsrfToken } from "../../lib/auth/csrf-client";
```

## String literal references

_no hits_

## Tests

1 hit(s):

```
tests/integration/incidents/vision-consent.test.ts:662:	// The vision components read a session-bound CSRF cookie via ensureCsrfToken
```

## Build files

_no hits_

## CI / workflows

_no hits_

## Config / env

_no hits_

## Docs

30 hit(s):

```
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:1:# Callsite census — `ensureCsrfToken`
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:12:src/components/ui/LanguageDropdown.tsx:6:import { ensureCsrfToken } from "../../lib/auth/csrf-client";
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:13:src/components/ui/LanguageDropdown.tsx:70:						[CSRF_HEADER_NAME]: ensureCsrfToken(CSRF_COOKIE_NAME),
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:14:src/components/forms/SubmitWithCsrfScript.tsx:50:		csrfToken = ensureCsrfToken(form.dataset.csrfCookie || "ssfw_csrf");
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:15:src/components/forms/SubmitWithCsrfScript.tsx:141:function ensureCsrfToken(name: string): string {
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:16:tests/integration/incidents/vision-consent.test.ts:662:	// The vision components read a session-bound CSRF cookie via ensureCsrfToken
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:17:src/app/workspace/settings/vision/VisionToggle.tsx:35:			const csrfToken = ensureCsrfToken(csrfCookieName);
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:18:src/app/workspace/settings/vision/VisionToggle.tsx:98:function ensureCsrfToken(name: string): string {
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:19:src/lib/auth/csrf-client.ts:11:export function ensureCsrfToken(name: string): string {
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:20:src/app/workspace/settings/invitations/page.tsx:62:			const csrfToken = ensureCsrfToken(csrfCookieName);
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:21:src/app/workspace/settings/invitations/page.tsx:201:function ensureCsrfToken(cookieName: string): string {
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:22:src/app/workspace/settings/members/RemoveMemberButton.tsx:31:			const csrfToken = ensureCsrfToken(csrfCookieName);
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:23:src/app/workspace/settings/members/RemoveMemberButton.tsx:83:function ensureCsrfToken(name: string): string {
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:24:src/components/incident/IncidentRowMenu.tsx:6:import { ensureCsrfToken } from "../../lib/auth/csrf-client";
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:25:src/components/incident/IncidentRowMenu.tsx:89:					"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:26:src/components/ui/LocaleSwitcher.tsx:57:			const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:27:src/components/ui/LocaleSwitcher.tsx:113:function ensureCsrfToken(name: string): string {
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:28:src/components/incident/coach/OverviewEditor.tsx:6:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:29:src/components/incident/coach/OverviewEditor.tsx:213:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:30:src/components/incident/coach/CoachWorkbench.tsx:13:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:31:src/components/incident/coach/CoachWorkbench.tsx:334:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:32:src/components/incident/coach/CoachWorkbench.tsx:405:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:33:src/components/incident/coach/CoachWorkbench.tsx:516:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:34:src/components/incident/coach/CauseTreeEditor.tsx:11:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:35:src/components/incident/coach/CauseTreeEditor.tsx:161:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:36:src/components/incident/coach/TimelineEditor.tsx:5:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:37:src/components/incident/coach/TimelineEditor.tsx:99:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:38:src/components/incident/coach/ActionPlanEditor.tsx:5:import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:39:src/components/incident/coach/ActionPlanEditor.tsx:114:						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
refactor/artifacts/20260618-simplify-loop/pass-01/census_ensureCsrfToken.md:40:src/app/workspace/company/delete/DeleteCompanyButton.tsx:38:			const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
```

## Per-file impact

files touched by this symbol:

| file | hits |
|------|------|
| `src/components/forms/SubmitWithCsrfScript.tsx` | 2 |
| `src/app/workspace/settings/vision/VisionToggle.tsx` | 2 |
| `src/app/workspace/settings/invitations/page.tsx` | 2 |
| `src/app/workspace/settings/members/RemoveMemberButton.tsx` | 2 |
| `src/app/workspace/chemicals/ChemicalProfilesClient.tsx` | 5 |
| `src/lib/auth/csrf-client.ts` | 1 |
| `src/components/incident/NewIncidentButton.tsx` | 2 |
| `src/components/incident/IncidentRowMenu.tsx` | 2 |
| `src/components/incident/IncidentVisionAction.tsx` | 2 |
| `src/components/incident/VisionConsentModal.tsx` | 2 |
| `src/components/incident/coach/OverviewEditor.tsx` | 2 |
| `src/components/incident/coach/PushToTalkButton.tsx` | 2 |
| `src/components/incident/coach/PhotosTab.tsx` | 2 |
| `src/components/incident/coach/CauseMethodToggle.tsx` | 2 |
| `src/components/incident/coach/CauseGraph.tsx` | 2 |
| `src/components/incident/coach/ActionPlanEditor.tsx` | 2 |
| `src/components/incident/coach/StatusControls.tsx` | 2 |
| `src/components/incident/coach/PhotoStrip.tsx` | 4 |
| `src/components/incident/coach/TimelineEditor.tsx` | 2 |
| `src/components/incident/coach/CauseTreeEditor.tsx` | 2 |
| `src/components/ui/LocaleSwitcher.tsx` | 2 |
| `src/components/ui/LanguageDropdown.tsx` | 2 |
| `src/app/disclaimer/page.tsx` | 2 |
| `src/app/incidents/[id]/approval/page.tsx` | 2 |
| `src/app/findings/audit-inspection/AuditInspectionCaptureClient.tsx` | 2 |
| `src/app/findings/safety-walk/SafetyWalkCaptureClient.tsx` | 2 |
| `src/app/workspace/actions/ActionFormClient.tsx` | 5 |
| `tests/integration/incidents/vision-consent.test.ts` | 1 |
| `src/app/workspace/company/delete/DeleteCompanyButton.tsx` | 2 |
| `src/components/incident/coach/CoachWorkbench.tsx` | 4 |

## Summary

Symbol: `ensureCsrfToken`

| Metric | Count |
|--------|-------|
| Total source hits | 68 |
| Unique source files | 30 |

⚠️  **Widely-used symbol**: >10 files reference this. Refactor is Tier-2 or Tier-3.
Consider: is renaming / extracting / moving worth the blast radius?
