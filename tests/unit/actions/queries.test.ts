import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !specifier.startsWith(".")) {
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
	actionBoardTodayKey,
	addDaysKey,
	isActionItemOverdue,
	normalizeActionItemStatusFilter,
	normalizeActionOriginTypeFilter,
	normalizeDueFilter,
} = await import("../../../src/lib/actions/filters");

test("normalizes supported action board filters", () => {
	assert.equal(normalizeActionItemStatusFilter("open"), "open");
	assert.equal(normalizeActionItemStatusFilter("in_progress"), "in_progress");
	assert.equal(normalizeActionItemStatusFilter("overdue"), null);
	assert.equal(normalizeActionItemStatusFilter("all"), null);

	assert.equal(normalizeActionOriginTypeFilter("hira"), "hira");
	assert.equal(normalizeActionOriginTypeFilter("ii"), "ii");
	assert.equal(normalizeActionOriginTypeFilter("incident"), null);

	assert.equal(normalizeDueFilter("due_today"), "due_today");
	assert.equal(normalizeDueFilter("overdue"), "overdue");
	assert.equal(normalizeDueFilter("stale"), "all");
	assert.equal(normalizeDueFilter(null), "all");
});

test("treats overdue as a due-date state, not a persisted status", () => {
	const today = new Date("2026-05-05T12:00:00.000Z");

	assert.equal(
		isActionItemOverdue({ dueDate: "2026-05-04", status: "open" }, today),
		true,
	);
	assert.equal(
		isActionItemOverdue(
			{ dueDate: "2026-05-04", status: "in_progress" },
			today,
		),
		true,
	);
	assert.equal(
		isActionItemOverdue({ dueDate: "2026-05-04", status: "completed" }, today),
		false,
	);
	assert.equal(
		isActionItemOverdue({ dueDate: "2026-05-04", status: "cancelled" }, today),
		false,
	);
	assert.equal(
		isActionItemOverdue({ dueDate: "2026-05-05", status: "open" }, today),
		false,
	);
	assert.equal(
		isActionItemOverdue({ dueDate: null, status: "open" }, today),
		false,
	);
});

test("uses local calendar dates for action-board due filters", () => {
	const earlyLocalMorning = new Date(2026, 4, 5, 0, 30);

	assert.equal(actionBoardTodayKey(earlyLocalMorning), "2026-05-05");
	assert.equal(addDaysKey("2026-05-05", 7), "2026-05-12");
	assert.equal(addDaysKey("2026-05-05", -7), "2026-04-28");
});
