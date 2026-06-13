import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const A11Y_PATH = path.resolve("docs", "design-system", "accessibility.md");

const EXPECTED_COMPONENTS = [
  "Button",
  "IconButton",
  "Input",
  "Textarea",
  "Select",
  "ComboBox",
  "SegmentedControl",
  "Badge",
  "StatusBadge",
  "Tooltip",
  "Toast",
  "Modal",
  "Drawer",
  "Card",
  "Tabs",
  "Breadcrumbs",
  "Table",
  "DataTable",
  "SidebarNav",
  "TopBar",
  "Empty state",
  "Loading state",
  "Error state",
];

// The five required bullet category keywords (case-insensitive match)
const BULLET_CATEGORIES = [
  "keyboard",
  "focus",
  "aria",
  "contrast",
  "motion",
];

function parseA11yDoc(raw: string) {
  const lines = raw.split("\n");
  const sections: Array<{
    heading: string;
    bullets: string[];
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^### (.+)$/);
    if (match) {
      const heading = match[1].trim();
      const bullets: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        if (lines[j].match(/^#{1,6} /)) break;
        if (lines[j].match(/^\s*-\s+/)) {
          bullets.push(lines[j].replace(/^\s*-\s+/, ""));
        }
        j++;
      }
      sections.push({ heading, bullets });
    }
  }
  return sections;
}

const raw = fs.readFileSync(A11Y_PATH, "utf-8");
const sections = parseA11yDoc(raw);

test("accessibility.md exists and is non-empty", () => {
  assert.ok(raw.length > 100, "accessibility.md should have substantial content");
});

test("accessibility.md has exactly 23 component sub-headings", () => {
  assert.equal(
    sections.length,
    23,
    `expected 23 component sections, found ${sections.length}: ${sections.map((s) => s.heading).join(", ")}`,
  );
});

test("component sub-headings match the inventory order", () => {
  const actual = sections.map((s) => s.heading);
  assert.deepEqual(
    actual,
    EXPECTED_COMPONENTS,
    "component order should match ssfw-cso inventory",
  );
});

test("each component section has the five required bullet categories", () => {
  const errors: string[] = [];
  for (const section of sections) {
    const bulletLower = section.bullets.map((b) => b.toLowerCase());
    for (const category of BULLET_CATEGORIES) {
      const found = bulletLower.some((b) => b.startsWith(category));
      if (!found) {
        errors.push(`${section.heading} missing "${category}" category`);
      }
    }
  }
  assert.ok(
    errors.length === 0,
    `missing bullet categories:\n${errors.join("\n")}`,
  );
});

test("each component section has 4-6 bullet lines", () => {
  const outOfRange: string[] = [];
  for (const section of sections) {
    if (section.bullets.length < 4 || section.bullets.length > 6) {
      outOfRange.push(`${section.heading} (${section.bullets.length} bullets)`);
    }
  }
  assert.ok(
    outOfRange.length === 0,
    `sections with bullet count outside 4-6: ${outOfRange.join("; ")}`,
  );
});

test("global expectations section exists", () => {
  assert.ok(
    raw.includes("## Global"),
    "should have a global expectations section at the top",
  );
  assert.ok(
    raw.toLowerCase().includes("prefers-reduced-motion"),
    "global section should mention prefers-reduced-motion",
  );
  assert.ok(
    raw.toLowerCase().includes("focus-visible"),
    "global section should mention focus-visible",
  );
  assert.ok(
    raw.toLowerCase().includes("color-only") || raw.toLowerCase().includes("colour-only"),
    "global section should mention no colour-only signals",
  );
});
