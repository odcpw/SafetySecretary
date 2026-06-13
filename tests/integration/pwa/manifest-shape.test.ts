import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifestPath = "public/manifest.webmanifest";
const raw = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(raw);

// ── Required top-level fields ──────────────────────────────────────

test("manifest.name is a non-empty string", () => {
  assert.ok(
    typeof manifest.name === "string" && manifest.name.length > 0,
    "name must be a non-empty string",
  );
  assert.equal(manifest.name, "Safety Secretary");
});

test("manifest.short_name is a non-empty string", () => {
  assert.ok(
    typeof manifest.short_name === "string" && manifest.short_name.length > 0,
    "short_name must be a non-empty string",
  );
  assert.ok(
    manifest.short_name.length <= manifest.name.length,
    "short_name should not be longer than name",
  );
});

test('manifest.start_url is "/"', () => {
  assert.equal(manifest.start_url, "/");
});

test('manifest.display is "standalone"', () => {
  assert.equal(manifest.display, "standalone");
});

// ── Color tokens (must match ssfw-1br dark tokens) ─────────────────

test("manifest.theme_color matches dark --color-bg (#0e0e10)", () => {
  assert.equal(manifest.theme_color, "#0e0e10");
});

test("manifest.background_color matches dark --color-surface (#16161a)", () => {
  assert.equal(manifest.background_color, "#16161a");
});

// ── Icons ──────────────────────────────────────────────────────────

const expectedSizes = [192, 256, 384, 512];

test("manifest.icons is an array with exactly 4 entries", () => {
  assert.ok(Array.isArray(manifest.icons), "icons must be an array");
  assert.equal(
    manifest.icons.length,
    4,
    "icons must have exactly 4 entries",
  );
});

for (const size of expectedSizes) {
  test(`manifest contains icon for ${size}x${size}`, () => {
    const icon = manifest.icons.find(
      (i: { sizes: string; src: string }) => i.sizes === `${size}x${size}` && i.src === `/icons/icon-${size}.png`,
    );
    assert.ok(icon, `Missing icon for ${size}x${size}`);
    assert.equal(icon.type, "image/png", `Icon ${size}x${size} must be image/png`);
  });
}

// ── Negative checks ────────────────────────────────────────────────

test("manifest does NOT contain serviceworker field", () => {
  assert.equal(
    manifest.serviceworker,
    undefined,
    "serviceworker must not be present",
  );
});

test("manifest does NOT contain share_target field", () => {
  assert.equal(
    manifest.share_target,
    undefined,
    "share_target must not be present",
  );
});
