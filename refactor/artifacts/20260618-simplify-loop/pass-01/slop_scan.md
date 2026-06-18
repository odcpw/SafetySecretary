# AI slop scan — 20260618-simplify-loop/pass-01

Generated 2026-06-18T13:36:59Z
Scope: `src`

(See references/VIBE-CODED-PATHOLOGIES.md for P1-P40 catalog.)


## P1 over-defensive try/catch (Python: ≥3 except Exception per file)

_none found_

## P1 over-defensive try/catch (TS: catch blocks per file)

_none found_

## P2 long nullish/optional chains (three+ `?.`)

_none found_

## P2 double-nullish coalescing

_none found_

## P3 orphaned _v2/_new/_old/_improved/_copy files

_none found_

## P4 utils/helpers/misc/common files > 500 LOC

_none found_

## P5 abstract Base/Abstract class hierarchy

_none found_

## P5 abstract class in Rust (rare idiom; often AI-generated)

_none found_

## P6 feature flags (review each for whether it is still toggling)

```
LEGACY_INVESTIGATION_STAGES
```

## P7 re-export barrel files (`export * from`)

_none found_

## P8 pass-through wrappers (function whose sole body returns another call)

_none found_

## P9 functions with ≥5 optional parameters

_none found_

## P10 swallowed catch (empty or `return null`)

_none found_

## P10 Python: except ... : pass

_none found_

## P11 Step/Phase/TODO comments (per-file counts)

_none found_

## P12 many-import files (top 20)

_none found_

## P14 mocks (jest.mock, vi.mock, sinon.stub, __mocks__)

_none found_

## P15 TS `any` usage (per-file counts, top 20)

_none found_

## P16 *Error enums in Rust (often duplicate variants)

_none found_

## P17 heavily drilled props (top 10 most-passed via JSX)

_none found_

## P18 everything hook (custom hook file with many useState/useEffect)

```
41 src/components/incident/coach/CoachWorkbench.tsx
13 src/components/incident/coach/CauseTreeEditor.tsx
13 src/app/findings/audit-inspection/AuditInspectionCaptureClient.tsx
11 src/app/workspace/chemicals/ChemicalProfilesClient.tsx
10 src/components/incident/coach/PhotoStrip.tsx
9 src/components/incident/coach/CauseGraph.tsx
9 src/app/workspace/actions/ActionBoardClient.tsx
8 src/components/incident/coach/OnePagerExportDialog.tsx
8 src/app/workspace/settings/invitations/page.tsx
8 src/app/signin/page.tsx
```

## P19 N+1 pattern (await inside for loop)

_none found_

## P19 Python N+1 (for ... : await)

_none found_

## P20 config files (candidates for unification)

```
./docker-compose.dev.yml
./.env.example
./.env
```

## P22 stringly-typed status/state comparisons

_none found_

## P22 Rust stringly-typed status/state comparisons

_none found_

## P23 reflex trim/lower/upper normalization

```
src/proxy.ts:127:	return STATE_CHANGING_METHODS.has(method.toUpperCase());
src/components/forms/SubmitWithCsrfScript.tsx:155:		.map((value) => value.trim())
src/app/workspace/settings/byok/page.tsx:376:	return typeof value === "string" ? value.trim() : "";
src/app/incidents/page.tsx:589:	const candidate = value?.trim() || defaultIncidentTimeZone;
src/app/workspace/settings/vision/VisionToggle.tsx:113:			.map((value) => value.trim())
src/app/workspace/chemicals/ChemicalProfilesClient.tsx:742:	const query = search.trim().toLowerCase();
src/app/workspace/chemicals/ChemicalProfilesClient.tsx:749:			profile.productName.toLowerCase().includes(query) ||
src/app/workspace/chemicals/ChemicalProfilesClient.tsx:750:			profile.manufacturer.toLowerCase().includes(query) ||
src/app/workspace/chemicals/ChemicalProfilesClient.tsx:751:			(profile.casNumber?.toLowerCase().includes(query) ?? false);
src/app/api/settings/vision/route.ts:185:		return value.toLowerCase();
src/components/ui/ComboBox.tsx:61:		const query = inputValue.trim().toLowerCase();
src/components/ui/ComboBox.tsx:68:			optionSearchText(option, filterKey).toLowerCase().includes(query),
src/app/workspace/settings/invitations/page.tsx:214:		.map((part) => part.trim())
src/components/ui/LocaleSwitcher.tsx:107:		locale.toUpperCase()
src/components/ui/LocaleSwitcher.tsx:128:			.map((value) => value.trim())
src/app/api/chemicals/[id]/sds/route.ts:256:		const [rawName, ...rawValue] = segment.trim().split("=");
src/app/api/chemicals/[id]/sds/route.ts:257:		const name = rawName?.trim();
src/app/api/chemicals/[id]/sds/route.ts:260:			cookies.set(name, rawValue.join("=").trim());
src/app/api/chemicals/[id]/sds/route.ts:269:		.toLowerCase()
src/app/api/chemicals/[id]/sds/route.ts:274:	return file.type.trim().toLowerCase() === "text/plain";
src/app/api/chemicals/[id]/sds/route.ts:295:	return typeof value === "string" ? value.trim() : "";
src/app/workspace/actions/ActionFormClient.tsx:832:	const trimmed = value.trim();
src/app/workspace/settings/members/page.tsx:84:										{member.uiLocale?.toUpperCase() ?? "-"}
src/app/incidents/[id]/approval/page.tsx:51:			.map((value) => value.trim())
src/app/incidents/[id]/approval/page.tsx:386:				snapshot.id === selected.toLowerCase(),
src/app/incidents/[id]/approval/page.tsx:470:	return typeof value === "string" && value.trim() ? value : null;
src/app/api/storage/upload/route.ts:151:		.toLowerCase()
src/app/api/storage/upload/route.ts:194:		const normalized = contentType.trim().toLowerCase();
src/app/workspace/settings/members/RemoveMemberButton.tsx:98:			.map((value) => value.trim())
src/app/workspace/company/delete/DeleteCompanyButton.tsx:30:		if (confirmation.trim() !== confirmationValue) {
src/app/workspace/company/delete/DeleteCompanyButton.tsx:109:			.map((value) => value.trim())
src/components/incident/coach/CauseGraph.tsx:167:	return LABELS[locale.split("-")[0]?.toLowerCase() ?? "en"] ?? LABELS.en;
src/components/incident/coach/CauseGraph.tsx:295:		const statement = text.trim();
src/components/incident/coach/CauseGraph.tsx:311:		const statement = text.trim();
src/components/incident/coach/CauseGraph.tsx:816:					disabled={busy || !value.trim()}
src/components/incident/coach/OverviewEditor.tsx:193:		const value = field.kind === "datetime" ? raw : raw.trim();
src/components/incident/coach/OverviewEditor.tsx:349:			title={`${copy.overview.editPrefix} ${field.label.toLowerCase()}`}
src/components/incident/VisionConsentModal.tsx:181:			.map((value) => value.trim())
src/components/incident/coach/CoachWorkbench.tsx:306:		const message = rawMessage.trim();
src/components/incident/coach/CoachWorkbench.tsx:371:		const message = input.trim();
src/components/incident/coach/CoachWorkbench.tsx:574:		const addition = text.trim();
src/components/incident/coach/CoachWorkbench.tsx:581:			current.trim() ? `${current.trimEnd()} ${addition}` : addition,
src/components/incident/coach/CoachWorkbench.tsx:793:								disabled={sending || !input.trim()}
src/components/incident/coach/CoachWorkbench.tsx:863:	const base = locale.split("-")[0]?.toLowerCase() ?? "en";
src/components/incident/coach/CoachWorkbench.tsx:1233:							disabled={busy || !editing.text.trim()}
src/components/incident/coach/CoachWorkbench.tsx:1378:		if (typeof candidate === "string" && candidate.trim()) {
src/components/incident/coach/CoachWorkbench.tsx:1528:			name = rawLine.slice("event:".length).trim();
src/app/disclaimer/page.tsx:124:      .map((value) => value.trim())
src/app/api/auth/company/route.ts:116:	return typeof value === "string" ? value.trim() : "";
src/components/incident/coach/RecordPanel.tsx:62:		GRAPHICAL_TAB_LABEL[locale.split("-")[0]?.toLowerCase() ?? "en"] ??
src/components/incident/coach/RecordPanel.tsx:387:	if (typeof value !== "string" || !value.trim()) {
src/components/incident/coach/RecordPanel.tsx:391:	const text = value.replaceAll("_", " ").toLowerCase();
src/components/incident/coach/RecordPanel.tsx:392:	return text.charAt(0).toUpperCase() + text.slice(1);
src/app/invite/[token]/page.tsx:202:	const protocol = forwardedProto?.split(",")[0]?.trim() || "http";
src/components/incident/coach/PushToTalkButton.tsx:96:				const text = (body.text ?? "").trim();
src/components/incident/coach/PhotosTab.tsx:49:			const caption = text.trim().slice(0, maxCaptionLength);
src/components/incident/coach/CauseTreeEditor.tsx:194:		const statement = text.trim();
src/components/incident/coach/CauseTreeEditor.tsx:211:		const statement = text.trim();
src/components/incident/coach/CauseTreeEditor.tsx:532:						disabled={busy || !adding.text.trim()}
src/components/incident/coach/CauseTreeEditor.tsx:815:								disabled={busy || !editing.text.trim()}
src/components/incident/coach/CauseMethodToggle.tsx:53:	return LABELS[locale.split("-")[0]?.toLowerCase() ?? "en"] ?? LABELS.en;
src/components/incident/coach/TimelineEditor.tsx:150:		const text = draft.text.trim();
src/components/incident/coach/TimelineEditor.tsx:178:		const text = draft.text.trim();
src/components/incident/coach/TimelineEditor.tsx:259:						disabled={busy || !draft.text.trim()}
src/components/incident/coach/TimelineEditor.tsx:486:							disabled={busy || !adding.text.trim()}
src/components/incident/coach/TimelineEditor.tsx:522:	const trimmed = timeLabel.trim();
src/components/incident/coach/TimelineEditor.tsx:532:		return trimmed.toLowerCase().includes(phaseWord.toLowerCase())
src/components/incident/coach/TimelineEditor.tsx:546:	if (typeof value !== "string" || !value.trim()) {
src/components/incident/coach/TimelineEditor.tsx:550:	const text = value.replaceAll("_", " ").toLowerCase();
src/components/incident/coach/TimelineEditor.tsx:551:	return text.charAt(0).toUpperCase() + text.slice(1);
src/components/incident/coach/ActionPlanEditor.tsx:140:		if (!draft.description.trim()) {
src/components/incident/coach/ActionPlanEditor.tsx:149:			description: draft.description.trim(),
src/components/incident/coach/ActionPlanEditor.tsx:151:			ownerRole: draft.ownerRole.trim(),
src/components/incident/coach/ActionPlanEditor.tsx:159:				summary: `Edited measure: ${truncate(draft.description.trim(), 120)}`,
src/components/incident/coach/ActionPlanEditor.tsx:170:		if (!draft.description.trim()) {
src/components/incident/coach/ActionPlanEditor.tsx:178:			description: draft.description.trim(),
src/components/incident/coach/ActionPlanEditor.tsx:180:			ownerRole: draft.ownerRole.trim(),
src/components/incident/coach/ActionPlanEditor.tsx:188:				summary: `Added measure: ${truncate(draft.description.trim(), 120)}`,
src/components/incident/coach/ActionPlanEditor.tsx:300:							disabled={busy || !editing.description.trim()}
src/components/incident/coach/ActionPlanEditor.tsx:448:								busy || !adding.description.trim() || !adding.causeNodeId
```

## P24 testability wrappers / mutable deps seams

_none found_

## P25 docstrings/comments that may contradict implementation

_none found_

## P26 TypeScript type assertions

_none found_

## P27 addEventListener sites (audit for cleanup)

_none found_

## P28 timers (audit for clearTimeout/clearInterval cleanup)

_none found_

## P29 regex construction in functions/loops

_none found_

## P30 debug print/log leftovers

```
src/lib/llm/logging.ts:221:	console.debug(JSON.stringify(record));
```

## P31 JSON.stringify used as key/hash/memo identity

_none found_

## P32 money-like arithmetic (audit integer cents/decimal)

_none found_

## P33 local time / UTC drift candidates

```
src/lib/agent/trace-store.ts:224:			updatedAt: new Date().toISOString(),
src/lib/agent/runtime.ts:253:	const now = (options.now ?? (() => new Date()))().toISOString();
src/components/incident/coach/CoachWorkbench.tsx:318:			createdAt: new Date().toISOString(),
src/components/incident/coach/CoachWorkbench.tsx:319:			id: `optimistic-${Date.now()}`,
src/components/incident/coach/CoachWorkbench.tsx:345:						id: `activity-${Date.now()}-${current.length}`,
src/lib/email/transport.ts:47:			sentAt: new Date().toISOString(),
src/lib/email/transport.ts:60:			sentAt: new Date().toISOString(),
src/lib/artifacts/regenerate.ts:136:	const generatedAt = input.now ?? new Date();
src/lib/actions/filters.ts:38:	today: Date = new Date(),
src/lib/actions/filters.ts:113:export function actionBoardTodayKey(today: Date = new Date()): string {
src/lib/snapshots/approve.ts:99:	const approvedAt = options.now ?? new Date();
src/lib/actions/mutations.ts:387:	const now = new Date();
src/lib/actions/mutations.ts:413:	const now = new Date();
src/lib/llm/audit.ts:50:	const calledAt = input.calledAt ?? new Date();
src/lib/actions/origin-contract.ts:87:		new Date();
src/lib/findings/finding-origin.ts:147:	const createdAt = optionalDate(input.createdAt, "createdAt") ?? new Date();
src/lib/actions/metric-summary.ts:46:	today: Date = new Date(),
src/lib/llm/logging.ts:196:		latency_ms: Math.max(0, Date.now() - input.startedAtMs),
src/lib/llm/logging.ts:225:	return (now?.() ?? new Date()).toISOString();
src/lib/llm/cost.ts:97:	const window = monthWindowUtc(options.now?.() ?? new Date());
src/lib/llm/cost.ts:177:		calledAt: input.calledAt ?? new Date(),
src/lib/llm/dispatch.ts:156:	const startedAt = Date.now();
src/lib/llm/dispatch.ts:456:		calledAt: options.now?.() ?? new Date(),
src/lib/llm/dispatch.ts:457:		latencyMs: Date.now() - startedAtMs,
src/lib/actions/action-item.ts:156:	const createdAt = optionalDate(input.createdAt, "createdAt") ?? new Date();
src/lib/auth/oauth-identity.ts:70:				lastSeenAt: new Date(),
src/lib/auth/oauth.ts:191:	const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
src/lib/auth/workspace-resolution.ts:254:	const now = new Date();
src/lib/auth/session.ts:117:	const now = options.now ?? new Date();
src/lib/auth/session.ts:147:	const now = options.now ?? new Date();
src/lib/auth/session.ts:167:	const now = options.now ?? new Date();
src/lib/auth/magic-link.ts:143:	const now = options.now ?? new Date();
src/lib/auth/magic-link.ts:194:	const now = input.now ?? new Date();
src/lib/auth/magic-link.ts:252:	const now = options.now ?? new Date();
src/lib/auth/magic-link.ts:319:		now: Date = new Date(),
src/lib/auth/invitations.ts:203:	const now = input.now ?? new Date();
src/lib/auth/invitations.ts:267:	const state = invitationState(invitation, input.now ?? new Date());
src/lib/auth/invitations.ts:302:	const now = input.now ?? new Date();
src/lib/auth/invitations.ts:354:		now: input.now ?? new Date(),
src/lib/chemicals/sds-extraction.ts:157:	const reviewedAt = input.now ?? new Date();
src/lib/incident/action-bridge.ts:307:	const now = new Date();
src/app/api/legal/acknowledgement/route.ts:85:				acknowledgedAt: new Date(),
src/app/api/incidents/route.ts:745:	const year = (incidentAt ?? new Date()).getUTCFullYear();
src/lib/incident/coach-prompt.ts:203:	}).format(new Date());
src/lib/storage/local-fs.ts:95:      const updatedAt = new Date();
src/lib/incident/coach-chat.ts:159:	const now = new Date();
src/lib/incident/coach-flue-runtime.ts:292:				now: new Date().toISOString(),
src/lib/incident/coach-flue-runtime.ts:344:	}).format(new Date());
src/app/findings/audit-inspection/AuditInspectionCaptureClient.tsx:565:	return globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}`;
src/app/api/auth/dev-session/route.ts:150:						acknowledgedAt: new Date(),
src/app/api/auth/dev-session/route.ts:187:					acknowledgedAt: new Date(),
src/app/api/auth/dev-session/route.ts:220:	const now = new Date();
src/app/api/incidents/[id]/status/route.ts:125:	const closedAt = nextStage === "CLOSED" ? new Date() : null;
src/app/api/incidents/[id]/record/route.ts:43:			createdAt: new Date().toISOString(),
```

## P34 detailed internal errors exposed

_none found_

## P35 suspicious ambiguous imports

_none found_

## P36 infra/config surfaces that should not ride with refactor commits

```
./.github/workflows/secret-scan.yml
./.github/workflows/visual-qa.yml
./docker-compose.dev.yml
./pnpm-lock.yaml
./package.json
./.next/build/package.json
./.next/dev/package.json
./.next/package.json
```

## P37 unpinned dependency snippets

_none found_

## P38 wildcard/glob imports

_none found_

## P39 async functions returning Promise (audit for real await)

_none found_

## P40 await/then in nearby non-async contexts (manual audit)

_none found_

---

## Next steps

1. Review each section; confirm which hits are real vs. false positives.
2. File beads for accepted patterns (one per pathology class).
3. Proceed to `./scripts/dup_scan.sh` for structural duplication.
4. Score candidates via `./scripts/score_candidates.py`.
5. For each accepted candidate: fill isomorphism card, edit, verify, ledger.

Full P1-P40 pathology catalog: `references/VIBE-CODED-PATHOLOGIES.md`.
Attack order (cheap wins first): the "AI-slop refactor playbook" in that file.
