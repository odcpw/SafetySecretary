import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const riskMatrixModulePath = pathToFileURL(
  path.resolve("src/lib/methodology/risk-matrix.ts"),
).href;

const {
  EXPECTED_RISK_MATRIX,
  LIKELIHOOD_CODES,
  RISK_MATRIX_CELLS,
  RiskMatrixValidationError,
  SEVERITY_CODES,
  lookupRiskBand,
  validateRiskMatrixFixture,
} = (await import(riskMatrixModulePath)) as typeof import("../../../src/lib/methodology/risk-matrix");

type ParsedDocCell = {
  severity: string;
  likelihood: string;
  band: string;
};

test("fixture is deterministic JSON and contains exactly 25 cells", () => {
  const fixturePath = "fixtures/methodology/risk-matrix.json";
  const raw = readFileSync(fixturePath, "utf8");

  assert.equal(
    `${JSON.stringify(RISK_MATRIX_CELLS, null, 2)}\n`,
    raw,
    "fixture JSON must be byte-stable under JSON.stringify(..., null, 2)",
  );
  assert.equal(RISK_MATRIX_CELLS.length, 25);
});

test("lookupRiskBand covers the full severity and likelihood cartesian product", () => {
  for (const likelihood of LIKELIHOOD_CODES) {
    for (const severity of SEVERITY_CODES) {
      assert.equal(
        lookupRiskBand(severity, likelihood),
        EXPECTED_RISK_MATRIX[likelihood][severity],
        `${severity}/${likelihood} must match methodology pack matrix`,
      );
    }
  }
});

test("lookupRiskBand rejects invalid severity and likelihood codes", () => {
  assert.throws(
    () => lookupRiskBand("Z", "1"),
    RiskMatrixValidationError,
  );
  assert.throws(
    () => lookupRiskBand("A", "9"),
    RiskMatrixValidationError,
  );
});

test("validateRiskMatrixFixture rejects malformed fixture data", () => {
  assert.throws(
    () => validateRiskMatrixFixture(RISK_MATRIX_CELLS.slice(0, -1)),
    /exactly 25 cells/,
  );
  assert.throws(
    () =>
      validateRiskMatrixFixture([
        ...RISK_MATRIX_CELLS.slice(0, -1),
        { severity: "A", likelihood: "1", band: "HIGH" },
      ]),
    /duplicate cell A:1/,
  );
  assert.throws(
    () =>
      validateRiskMatrixFixture([
        { ...RISK_MATRIX_CELLS[0], band: "CRITICAL" },
        ...RISK_MATRIX_CELLS.slice(1),
      ]),
    /cell 0\.band/,
  );
  assert.throws(
    () =>
      validateRiskMatrixFixture([
        { ...RISK_MATRIX_CELLS[0], band: "LOW" },
        ...RISK_MATRIX_CELLS.slice(1),
      ]),
    /A:1 must be HIGH/,
  );
});

const methodologyPackPath = resolveMethodologyPackPath();

test(
  "fixture matches docs/methodology-pack.md risk matrix table when the pack is available",
  {
    skip: methodologyPackPath
      ? false
      : "docs/methodology-pack.md is not present in this target checkout; set METHODOLOGY_PACK_PATH to cross-check the control-repo pack",
  },
  () => {
    assert.ok(methodologyPackPath, "methodology pack path must be resolved");

    const parsedCells = parseRiskMatrixTable(readFileSync(methodologyPackPath, "utf8"));
    assert.deepEqual(
      cellMap(parsedCells),
      cellMap(RISK_MATRIX_CELLS),
      "methodology pack risk matrix table must match runtime fixture",
    );
  },
);

function cellMap(cells: readonly ParsedDocCell[]): Record<string, string> {
  return Object.fromEntries(
    cells
      .map((cell) => [`${cell.severity}:${cell.likelihood}`, cell.band] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function resolveMethodologyPackPath(): string | null {
  if (process.env.METHODOLOGY_PACK_PATH) {
    return process.env.METHODOLOGY_PACK_PATH;
  }

  const targetPath = path.resolve("docs/methodology-pack.md");
  return existsSync(targetPath) ? targetPath : null;
}

function parseRiskMatrixTable(markdown: string): ParsedDocCell[] {
  const sectionMatch = markdown.match(
    /## Risk matrix \(5 × 5\)([\s\S]*?)(?:\n## |\n# |$)/,
  );
  const section = sectionMatch?.[1];

  assert.ok(section, "methodology pack must contain a Risk matrix section");

  const tableLines = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));

  const headerCells = splitMarkdownRow(tableLines[0]);
  const severityCodes = headerCells.slice(1).map((cell): string => {
    const code = cell.match(/\b[A-E]\b/)?.[0];
    assert.ok(code, `could not parse severity code from header cell "${cell}"`);
    return code;
  });

  assert.deepEqual([...severityCodes].sort(), [...SEVERITY_CODES].sort());

  const bodyRows = tableLines.slice(2);
  assert.equal(bodyRows.length, LIKELIHOOD_CODES.length);

  return bodyRows.flatMap((row, rowIndex) => {
    const cells = splitMarkdownRow(row);
    const likelihood = cells[0].match(/\b[1-5]\b/)?.[0];
    assert.ok(likelihood, `could not parse likelihood code from row "${row}"`);
    assert.equal(likelihood, LIKELIHOOD_CODES[rowIndex]);

    return severityCodes.map((severity, severityIndex) => ({
      severity,
      likelihood,
      band: cells[severityIndex + 1],
    }));
  });
}

function splitMarkdownRow(row: string): string[] {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim().replace(/\*\*/g, ""));
}
