import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const schemaModulePath = pathToFileURL(
  path.resolve("src/lib/taxonomy/schema.ts"),
).href;
const validateModulePath = pathToFileURL(
  path.resolve("src/lib/taxonomy/validate.ts"),
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "./schema" &&
      context.parentURL?.endsWith("/src/lib/taxonomy/validate.ts")
    ) {
      return {
        shortCircuit: true,
        url: pathToFileURL(path.resolve("src/lib/taxonomy/schema.ts")).href,
      };
    }

    return nextResolve(specifier, context);
  },
});

const {
  CONTROL_HIERARCHY_CODES,
  CONTROL_HIERARCHY_LETTERS,
  HAZARD_CATEGORY_CODES,
  LIKELIHOOD_CODES,
  RISK_BAND_CODES,
  SEVERITY_CODES,
} = (await import(schemaModulePath)) as typeof import("../../../src/lib/taxonomy/schema");
const { validateTaxonomyFile } =
  (await import(validateModulePath)) as typeof import("../../../src/lib/taxonomy/validate");

type TestEntry = Record<string, unknown>;

interface TestTaxonomyFixture {
  categories: TestEntry[];
  severity: TestEntry[];
  likelihood: TestEntry[];
  riskBands: TestEntry[];
  controlHierarchy: TestEntry[];
}

function buildValidFixture(): TestTaxonomyFixture {
  return {
    categories: HAZARD_CATEGORY_CODES.map((code) => ({
      code,
      label: `${code} label`,
      description: `${code} description`,
      examples: [`${code} example`],
    })),
    severity: SEVERITY_CODES.map((code) => ({
      code,
      label: `${code} label`,
      anchor: `${code} anchor`,
    })),
    likelihood: LIKELIHOOD_CODES.map((code) => ({
      code,
      label: `${code} label`,
      anchor: `${code} anchor`,
    })),
    riskBands: RISK_BAND_CODES.map((code) => ({
      code,
      label: `${code} label`,
    })),
    controlHierarchy: CONTROL_HIERARCHY_CODES.map((code) => ({
      code,
      letter: CONTROL_HIERARCHY_LETTERS[code],
      label: `${code} label`,
    })),
  };
}

function errorAtPath(fixture: unknown, pathFragment: string) {
  const result = validateTaxonomyFile(fixture);

  return {
    result,
    found: result.errors.some((error) => error.path.includes(pathFragment)),
  };
}

test("canonical code sets match ADR-0003 D4 and methodology pack order", () => {
  assert.deepEqual(HAZARD_CATEGORY_CODES, [
    "MECHANICAL",
    "FALLS",
    "ELECTRICAL",
    "HAZARDOUS_SUBSTANCES",
    "FIRE_EXPLOSION",
    "THERMAL",
    "PHYSICAL_AGENTS",
    "ENVIRONMENTAL",
    "MUSCULOSKELETAL",
    "PSYCHOSOCIAL",
    "UNEXPECTED_ACTIONS",
    "WORK_ORGANISATION",
  ]);
  assert.deepEqual(SEVERITY_CODES, ["A", "B", "C", "D", "E"]);
  assert.deepEqual(LIKELIHOOD_CODES, ["1", "2", "3", "4", "5"]);
  assert.deepEqual(RISK_BAND_CODES, ["HIGH", "MEDIUM", "LOW"]);
  assert.deepEqual(CONTROL_HIERARCHY_CODES, [
    "SUBSTITUTION",
    "TECHNICAL",
    "ORGANIZATIONAL",
    "PPE",
  ]);
});

test("valid stub fixture passes", () => {
  const result = validateTaxonomyFile(buildValidFixture());

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("missing a category fails with a categories path", () => {
  const fixture = buildValidFixture();
  fixture.categories = fixture.categories.slice(0, -1);
  const { result, found } = errorAtPath(fixture, "$.categories");

  assert.equal(result.valid, false);
  assert.equal(found, true);
});

test("an extra category fails with a categories path", () => {
  const fixture = buildValidFixture();
  fixture.categories.push({
    code: "MECHANICAL",
    label: "duplicate label",
    description: "duplicate description",
    examples: ["duplicate example"],
  });
  const { result, found } = errorAtPath(fixture, "$.categories");

  assert.equal(result.valid, false);
  assert.equal(found, true);
});

test("empty labels fail with the label path", () => {
  const fixture = buildValidFixture();
  fixture.categories[0].label = " ";
  const { result, found } = errorAtPath(fixture, "$.categories[0].label");

  assert.equal(result.valid, false);
  assert.equal(found, true);
});

test("wrong control-hierarchy letter fails with the letter path", () => {
  const fixture = buildValidFixture();
  fixture.controlHierarchy[0].letter = "T";
  const { result, found } = errorAtPath(
    fixture,
    "$.controlHierarchy[0].letter",
  );

  assert.equal(result.valid, false);
  assert.equal(found, true);
});

test("MECHANIC is rejected in place of MECHANICAL", () => {
  const fixture = buildValidFixture();
  fixture.categories[0].code = "MECHANIC";
  const { result, found } = errorAtPath(fixture, "$.categories[0].code");

  assert.equal(result.valid, false);
  assert.equal(found, true);
});

test("required D9 fields are enforced", () => {
  const missingDescription = buildValidFixture();
  delete missingDescription.categories[0].description;
  const categoryResult = errorAtPath(
    missingDescription,
    "$.categories[0].description",
  );

  const missingAnchor = buildValidFixture();
  delete missingAnchor.severity[0].anchor;
  const severityResult = errorAtPath(missingAnchor, "$.severity[0].anchor");

  const missingLetter = buildValidFixture();
  delete missingLetter.controlHierarchy[0].letter;
  const controlResult = errorAtPath(
    missingLetter,
    "$.controlHierarchy[0].letter",
  );

  assert.equal(categoryResult.result.valid, false);
  assert.equal(categoryResult.found, true);
  assert.equal(severityResult.result.valid, false);
  assert.equal(severityResult.found, true);
  assert.equal(controlResult.result.valid, false);
  assert.equal(controlResult.found, true);
});

test("validator errors are structured path/message objects", () => {
  const result = validateTaxonomyFile({});

  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);

  for (const error of result.errors) {
    assert.equal(typeof error.path, "string");
    assert.equal(typeof error.message, "string");
    assert.ok(error.path.startsWith("$"));
    assert.ok(error.message.length > 0);
  }
});
