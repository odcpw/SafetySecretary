import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

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

const {
	buildCoachProposalDigestFromMessages,
	findDuplicateCoachProposalOperations,
} = (await import(
	moduleUrl("src/lib/incident/coach-proposal-digest.ts")
)) as typeof import("../../../src/lib/incident/coach-proposal-digest");

test("coach proposal digest separates pending, applied, and dismissed operations", () => {
	const digest = buildCoachProposalDigestFromMessages([
		{
			createdAt: "2026-06-16T10:00:00.000Z",
			id: "message-1",
			operationDecisions: {
				"op-field": { recordId: "record-1", status: "applied" },
				"op-fact": { status: "dismissed" },
			},
			operations: [
				{
					id: "op-field",
					kind: "incident_field_update",
					payload: { field: "location", value: "Loading bay" },
				},
				{
					id: "op-fact",
					kind: "fact",
					payload: { text: "The spill kit was empty." },
				},
				{
					id: "op-action",
					kind: "stop_action",
					payload: { title: "Shift lead checks spill kit at shift start" },
				},
			],
		},
	]);

	assert.deepEqual(digest.statusCounts, {
		applied: 1,
		dismissed: 1,
		pending: 1,
	});
	assert.equal(digest.applied[0]?.gist, "location=Loading bay");
	assert.equal(digest.applied[0]?.recordId, "record-1");
	assert.equal(digest.dismissed[0]?.gist, "The spill kit was empty.");
	assert.equal(
		digest.pending[0]?.gist,
		"Shift lead checks spill kit at shift start",
	);
});

test("coach proposal digest flags repeated pending applied or dismissed proposals", () => {
	const digest = buildCoachProposalDigestFromMessages([
		{
			createdAt: "2026-06-16T10:00:00.000Z",
			id: "message-1",
			operationDecisions: {
				"op-field": { recordId: "record-1", status: "applied" },
				"op-fact": { status: "dismissed" },
			},
			operations: [
				{
					id: "op-field",
					kind: "incident_field_update",
					payload: { field: "location", value: "Loading bay" },
				},
				{
					id: "op-fact",
					kind: "fact",
					payload: { text: "The spill kit was empty." },
				},
				{
					id: "op-action",
					kind: "stop_action",
					payload: { title: "Shift lead checks spill kit at shift start" },
				},
			],
		},
	]);

	const errors = findDuplicateCoachProposalOperations({
		operations: [
			{
				index: 0,
				operation: {
					kind: "incident_field_update",
					payload: { field: "location", value: "Loading bay" },
				},
			},
			{
				index: 1,
				operation: {
					kind: "stop_action",
					payload: { title: "Shift lead checks spill kit at shift start" },
				},
			},
			{
				index: 2,
				operation: {
					kind: "fact",
					payload: { text: "A different fact." },
				},
			},
		],
		proposalDigest: digest,
	});

	assert.deepEqual(
		errors.map((error) => error.index),
		[0, 1],
	);
	assert.match(errors[0]?.message ?? "", /Duplicate applied proposal/i);
	assert.match(errors[1]?.message ?? "", /Duplicate pending proposal/i);
});

test("coach proposal digest keeps cause-linked actions distinct even when titles match", () => {
	const digest = buildCoachProposalDigestFromMessages([
		{
			createdAt: "2026-06-16T10:00:00.000Z",
			id: "message-1",
			operationDecisions: {
				"op-action-a": { recordId: "record-a", status: "applied" },
			},
			operations: [
				{
					id: "op-action-a",
					kind: "stop_action",
					payload: {
						linkedCauseNodeId: "cause-a",
						title: "Shift lead checks spill kit at shift start",
					},
				},
			],
		},
	]);

	const errors = findDuplicateCoachProposalOperations({
		operations: [
			{
				index: 0,
				operation: {
					kind: "stop_action",
					payload: {
						linkedCauseNodeId: "cause-b",
						title: "Shift lead checks spill kit at shift start",
					},
				},
			},
		],
		proposalDigest: digest,
	});

	assert.deepEqual(errors, []);
	assert.equal(
		digest.applied[0]?.gist,
		"[cause-a] Shift lead checks spill kit at shift start",
	);
});

function moduleUrl(relativePath: string): string {
	return pathToFileURL(relativePath).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}
