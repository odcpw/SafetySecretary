import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { AgentContextBundle } from "../../../src/lib/agent/types";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !isLocalImport(specifier)) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}.tsx`, context.parentURL),
			new URL(`${specifier}.json`, context.parentURL),
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) => existsSync(candidate));

		if (resolved) {
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
});

const { buildFlueIncidentRecordView } = (await import(
	moduleUrl("src/lib/incident/coach-flue-record-view.ts")
)) as typeof import("../../../src/lib/incident/coach-flue-record-view");

test("flue incident record view keeps case data and removes app internals", () => {
	const context: AgentContextBundle = {
		companyMemoryExcerpts: [{ id: "memory-1", sourceRefs: [], summary: "old" }],
		conversationHistory: [
			{
				createdAt: "2026-06-16T09:00:00.000Z",
				id: "message-1",
				role: "user",
				text: "long previous transcript",
			},
		],
		generatedArtifacts: [],
		metadata: {
			createdAt: "2026-06-16T09:00:00.000Z",
			kind: "authoring",
			locale: "en",
			requiresVision: false,
			runId: "run-1",
			skill: { id: "incident-coach", version: "1" },
			surface: "workbench",
			tenantId: "tenant-1",
			userId: "user-1",
			workflowId: "incident-1",
			workflowType: "II",
		},
		methodologyRefs: [{ id: "docs/internal.md" }],
		sameCompanyPatterns: [],
		workflowSnapshot: {
			attachmentRefs: [{ id: "attachment-1", type: "timeline_attachment" }],
			sections: {
				accounts: [
					{
						id: "account-1",
						personId: "person-1",
						rawStatement: "x".repeat(2000),
					},
				],
				actions: [
					{
						actionType: "ORGANIZATIONAL",
						causeNodeId: "cause-1",
						description: "Shift lead refills spill kit at shift start.",
						dueDate: new Date("2026-06-20T00:00:00.000Z"),
						id: "action-1",
						ownerRole: "shift lead",
						status: "open",
					},
				],
				causes: [
					{
						branchStatus: "ROOT_REACHED",
						id: "cause-1",
						isRootCause: true,
						parentId: null,
						question: "Why was the spill not contained?",
						statement: "Spill kit ownership was unclear.",
					},
				],
				evidence: [
					{
						caption: "Photo of empty spill kit",
						eventId: "event-1",
						filename: "spill-kit.jpg",
						id: "attachment-1",
						mimeType: "image/jpeg",
						sizeBytes: 1234,
						storageKey: "private/key/not-for-model",
					},
				],
				facts: [
					{
						accountId: "account-1",
						id: "fact-1",
						personId: "person-1",
						personName: "Mara",
						personRole: "operator",
						text: "The spill kit was empty.",
					},
				],
				hiraFollowup: { needed: true, text: "Review spill response HIRA." },
				incident: {
					causeMethod: "FIVE_WHYS",
					id: "incident-1",
					incidentAt: new Date("2026-06-16T07:30:00.000Z"),
					location: "Loading bay",
					metadataOnly: "do not expose",
					potentialSeverity: "B",
					seriousPotential: true,
					title: "Slip near loading bay",
					workflowStage: "CAUSES",
				},
				people: [
					{
						id: "person-1",
						name: "Mara",
						otherInfo: "temporary line cover",
						role: "injured person",
					},
				],
				timeline: [
					{
						attachmentCount: 1,
						confidence: "CONFIRMED",
						eventAt: "2026-06-16T07:30:00.000Z",
						id: "event-1",
						phase: "event",
						text: "Mara slipped while carrying a tote.",
						timeLabel: "event",
					},
				],
			},
		},
	};

	const view = buildFlueIncidentRecordView(context);

	assert.equal(view.incident.id, "incident-1");
	assert.equal(view.incident.incidentAt, "2026-06-16T07:30:00.000Z");
	assert.equal(view.incident.metadataOnly, undefined);
	assert.equal(view.counts.actions, 1);
	assert.equal(view.accounts.items[0]?.rawStatement, `${"x".repeat(1597)}...`);
	assert.equal(view.evidence.items[0]?.storageKey, undefined);
	assert.equal(
		view.actions.items[0]?.dueDate,
		"2026-06-20T00:00:00.000Z",
	);
	assert.equal(
		Object.hasOwn(view as unknown as Record<string, unknown>, "metadata"),
		false,
	);
	assert.equal(
		Object.hasOwn(
			view as unknown as Record<string, unknown>,
			"conversationHistory",
		),
		false,
	);
});

function moduleUrl(relativePath: string): string {
	return pathToFileURL(relativePath).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}
