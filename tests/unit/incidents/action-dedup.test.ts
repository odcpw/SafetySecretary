import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !isLocalImport(specifier)) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}.tsx`, context.parentURL),
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

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

const {
	ACTION_DEDUP_JACCARD_THRESHOLD,
	actionSimilarity,
	isNearDuplicateAction,
} = (await import(
	"../../../src/lib/agent/incident-investigation/apply-operation"
)) as typeof import("../../../src/lib/agent/incident-investigation/apply-operation");

// A measure already stored against a cause.
type StoredAction = {
	readonly causeNodeId: string;
	readonly description: string;
};

/**
 * Mirror of the DB-side dedup decision in apply-operation (nearDuplicateActionId)
 * without a database: compare an incoming measure ONLY against existing measures
 * on the SAME cause, take the best match clearing the threshold. Returns the
 * matched stored action, or null when a fresh row should be inserted. Used to
 * prove the same-cause-only guarantee that the SQL `WHERE cause_node_id = ...`
 * provides.
 */
function nearDuplicateOnSameCause(
	existing: readonly StoredAction[],
	incoming: { readonly causeNodeId: string; readonly description: string },
): StoredAction | null {
	let best: StoredAction | null = null;
	let bestScore = 0;
	for (const action of existing) {
		if (action.causeNodeId !== incoming.causeNodeId) {
			continue;
		}
		const score = actionSimilarity(incoming.description, action.description);
		if (score >= ACTION_DEDUP_JACCARD_THRESHOLD && score > bestScore) {
			bestScore = score;
			best = action;
		}
	}
	return best;
}

const causeA = "11111111-1111-4111-8111-111111111111";
const causeB = "22222222-2222-4222-8222-222222222222";

test("the dedup threshold is a high, conservative similarity", () => {
	// Documented threshold: a reworded refinement clears it; distinct measures
	// stay well below. Guard against an accidental loosening that would start
	// merging genuinely different controls.
	assert.equal(ACTION_DEDUP_JACCARD_THRESHOLD, 0.6);
});

test("a reworded refinement of the same measure is a near-duplicate", () => {
	const early = "Fit a fixed charger bracket at the dock 2 wall";
	const refined = "Fit a fixed charger bracket at the dock 2 wall by July";

	assert.ok(
		actionSimilarity(early, refined) >= ACTION_DEDUP_JACCARD_THRESHOLD,
		`similarity ${actionSimilarity(early, refined)}`,
	);
	assert.equal(isNearDuplicateAction(early, refined), true);

	// On the same cause it folds into the existing row instead of duplicating.
	const match = nearDuplicateOnSameCause(
		[{ causeNodeId: causeA, description: early }],
		{ causeNodeId: causeA, description: refined },
	);
	assert.equal(match?.description, early);
});

test("two genuinely different measures on the same cause both persist", () => {
	const technical = "Fit a fixed charger bracket at the dock 2 wall";
	const organizational =
		"Run a toolbox talk on cable housekeeping for the dock crew";

	assert.ok(
		actionSimilarity(technical, organizational) <
			ACTION_DEDUP_JACCARD_THRESHOLD,
		`similarity ${actionSimilarity(technical, organizational)}`,
	);
	assert.equal(isNearDuplicateAction(technical, organizational), false);

	// No near-duplicate found, so the second measure is inserted as a new row.
	const match = nearDuplicateOnSameCause(
		[{ causeNodeId: causeA, description: technical }],
		{ causeNodeId: causeA, description: organizational },
	);
	assert.equal(match, null);
});

test("similar text on DIFFERENT causes is never merged", () => {
	const description = "Add a daily housekeeping check of the walkway";

	// The strings are identical (max similarity) yet they live on different
	// causes, so the same-cause-scoped lookup must not match them.
	assert.equal(actionSimilarity(description, description), 1);
	const match = nearDuplicateOnSameCause(
		[{ causeNodeId: causeA, description }],
		{ causeNodeId: causeB, description },
	);
	assert.equal(match, null);
});

test("blank or token-less descriptions never trigger a merge", () => {
	assert.equal(actionSimilarity("", ""), 0);
	assert.equal(actionSimilarity("   ", "anything"), 0);
	assert.equal(isNearDuplicateAction(null, "Install a guard rail"), false);
	assert.equal(isNearDuplicateAction("Install a guard rail", undefined), false);
});

test("the best same-cause match wins when several existing rows clear the threshold", () => {
	const incoming = "Fit a fixed charger bracket at the dock 2 wall by July";
	const loose = "Fit a fixed charger bracket at dock 2";
	const tight = "Fit a fixed charger bracket at the dock 2 wall";

	const match = nearDuplicateOnSameCause(
		[
			{ causeNodeId: causeA, description: loose },
			{ causeNodeId: causeA, description: tight },
		],
		{ causeNodeId: causeA, description: incoming },
	);
	// Both candidates clear the threshold; the tighter wording is the
	// higher-similarity match and should be chosen.
	assert.ok(isNearDuplicateAction(incoming, loose));
	assert.ok(isNearDuplicateAction(incoming, tight));
	assert.equal(match?.description, tight);
	assert.ok(
		actionSimilarity(incoming, tight) > actionSimilarity(incoming, loose),
	);
});
