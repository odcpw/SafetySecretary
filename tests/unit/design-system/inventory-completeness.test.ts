import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const INVENTORY_PATH = path.resolve("docs/design-system/inventory.md");

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

// The four required bullet labels (first words after the dash)
const BULLET_LABELS = [
  "Visual brief",
  "States",
  "Props summary",
  "Example use",
];

function parseInventory(raw: string) {
  const lines = raw.split("\n");
  const sections: Array<{
    heading: string;
    headingLine: number;
    bullets: string[];
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match ### ComponentName headings (h3-level)
    const match = line.match(/^### (.+)$/);
    if (match) {
      const heading = match[1].trim();
      const bullets: string[] = [];

      // Collect bullet lines following the heading (until next heading or non-bullet)
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        // Stop at next heading or end of file
        if (next.match(/^#{1,6} /)) break;
        // Collect lines starting with "- " or "  - "
        if (next.match(/^\s*-\s+/)) {
          bullets.push(next.replace(/^\s*-\s+/, ""));
        }
        j++;
      }

      sections.push({ heading, headingLine: i + 1, bullets });
    }
  }

  return sections;
}

const raw = fs.readFileSync(INVENTORY_PATH, "utf-8");
const sections = parseInventory(raw);

test("inventory.md exists and is non-empty", () => {
  assert.ok(raw.length > 100, "inventory.md should have substantial content");
});

test("inventory.md has exactly 23 component headings", () => {
  assert.equal(
    sections.length,
    23,
    `expected 23 component sections, found ${sections.length}: ${sections.map((s) => s.heading).join(", ")}`,
  );
});

test("component headings appear in the documented order", () => {
  const actual = sections.map((s) => s.heading);
  assert.deepEqual(
    actual,
    EXPECTED_COMPONENTS,
    "component order should match the bead specification",
  );
});

test("each component has exactly four bullet lines", () => {
  const missing: string[] = [];
  for (const section of sections) {
    if (section.bullets.length < 4) {
      missing.push(
        `${section.heading} (${section.bullets.length} bullets)`,
      );
    }
  }
  assert.ok(
    missing.length === 0,
    `components with fewer than 4 bullets: ${missing.join("; ")}`,
  );
});

test("each component has the four required bullet labels", () => {
  const errors: string[] = [];
  for (const section of sections) {
    const labels = section.bullets.map((b) => b.split(":")[0].trim());
    for (const expected of BULLET_LABELS) {
      if (!labels.includes(expected)) {
        errors.push(
          `${section.heading} missing "${expected}" (has: ${labels.join(", ")})`,
        );
      }
    }
  }
  assert.ok(
    errors.length === 0,
    `missing bullet labels:\n${errors.join("\n")}`,
  );
});

test("no extra component headings beyond the 23", () => {
  const extra = sections
    .map((s) => s.heading)
    .filter((h) => !EXPECTED_COMPONENTS.includes(h));
  assert.ok(
    extra.length === 0,
    `unexpected component headings: ${extra.join(", ")}`,
  );
});
