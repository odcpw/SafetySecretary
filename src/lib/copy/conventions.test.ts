import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types runner resolves this local TS module at runtime.
import { formatCopyLintViolations, lintSourceText, lintUiCopyFiles } from "./lint-rules.ts";

test("src/components/ui static copy has no no-cheese violations", () => {
	const violations = lintUiCopyFiles();

	assert.equal(violations.length, 0, formatCopyLintViolations(violations));
});

test("deliberate violation with generic submit and emoji is caught", () => {
	const violations = lintSourceText(
		"virtual.tsx",
		`export function Fixture() { return <button aria-label="Submit ✨">Submit ✨</button>; }`,
	);

	assert.ok(
		violations.some((violation) => violation.rule === "emoji"),
		"emoji violation should be present",
	);
	assert.ok(
		violations.some((violation) => violation.rule === "generic-submit"),
		"generic Submit violation should be present",
	);
});

test("clean static copy passes", () => {
	const violations = lintSourceText(
		"virtual.tsx",
		`export function Fixture() { return <button aria-label="Save assessment">Save assessment</button>; }`,
	);

	assert.deepEqual(violations, []);
});

test("decorative image alt text is caught", () => {
	const violations = lintSourceText(
		"virtual.tsx",
		`export function Fixture() { return <img alt="decorative illustration" />; }`,
	);

	assert.ok(
		violations.some((violation) => violation.rule === "decorative-image-alt"),
		"decorative image alt should be present",
	);
});
