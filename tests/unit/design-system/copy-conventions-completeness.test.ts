import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const DOC_PATH = path.resolve("docs", "design-system", "copy-conventions.md");

// The five required sections (matched by heading content, case-insensitive)
const REQUIRED_SECTIONS = [
	"tone",
	"capitalisation",
	"error-message",
	"empty",
	"action verbs",
];

// Anti-patterns section is also required
const REQUIRED_ANTI_PATTERN = "anti-pattern";

function parseSections(raw: string) {
	const lines = raw.split("\n");
	const sections: string[] = [];
	for (const line of lines) {
		const match = line.match(/^## (.+)$/);
		if (match) {
			sections.push(match[1].toLowerCase());
		}
	}
	return sections;
}

function countTableRows(raw: string) {
	// Count rows in markdown tables (lines with | that are not header separators)
	const lines = raw.split("\n");
	let inTable = false;
	let rowCount = 0;
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith("|")) {
			if (/^\|[\s-:|]+\|$/.test(trimmed)) {
				inTable = true;
				continue;
			}
			if (inTable) {
				rowCount++;
			}
		} else {
			inTable = false;
		}
	}
	return rowCount;
}

const raw = fs.readFileSync(DOC_PATH, "utf-8");
const sections = parseSections(raw);

// Line count
const lineCount = raw.split("\n").length;

test("copy-conventions.md exists and is non-empty", () => {
	assert.ok(raw.length > 200, "doc should have substantial content");
});

test("doc is at most 400 lines", () => {
	assert.ok(lineCount <= 400, `doc should be ≤ 400 lines, is ${lineCount}`);
});

test("doc contains the five required sections", () => {
	const missing: string[] = [];
	for (const required of REQUIRED_SECTIONS) {
		const found = sections.some((s) => s.includes(required));
		if (!found) {
			missing.push(required);
		}
	}
	assert.ok(
		missing.length === 0,
		`missing required sections: ${missing.join(", ")}`,
	);
});

test("doc contains an anti-patterns section", () => {
	const found = sections.some((s) => s.includes(REQUIRED_ANTI_PATTERN));
	assert.ok(found, "should have an anti-patterns section");
});

test("examples table has at least 8 rows (4 positive + 4 negative)", () => {
	const rowCount = countTableRows(raw);
	assert.ok(
		rowCount >= 8,
		`examples table should have ≥ 8 rows, found ${rowCount}`,
	);
});

test("examples table has 'good' and 'bad' columns", () => {
	const headerMatch = raw.match(
		/\|[^|]*\|\s*(good|Good)\s*\|\s*(bad|Bad)\s*\|/i,
	);
	assert.ok(
		headerMatch !== null,
		"examples table should have 'good' and 'bad' columns",
	);
});
