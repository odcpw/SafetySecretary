import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const FIXTURES_DIR = path.resolve("fixtures", "photos", "synthetic");
const SCRIPT_PATH = path.resolve("scripts", "fixtures", "generate-synthetic-photos.ts");

const EXPECTED_FILES = [
  "placeholder-256.png",
  "placeholder-1024.png",
  "mechanical-hazard-synth.png",
  "falls-hazard-synth.png",
  "electrical-hazard-synth.png",
  "evidence-timeline-synth.png",
];

function readFixture(name: string): Promise<Buffer> {
  return readFile(path.join(FIXTURES_DIR, name));
}

// ── 1. All expected fixtures exist and are non-empty ────────────────

test("all 6 synthetic fixtures exist and are non-empty", async () => {
  for (const name of EXPECTED_FILES) {
    const filePath = path.join(FIXTURES_DIR, name);
    const fileStat = await stat(filePath);
    assert.ok(
      fileStat.size > 0,
      `${name} should be non-empty (is ${fileStat.size} bytes)`,
    );
  }
});

// ── 2. PNG integrity: valid signature and chunk structure ───────────

test("each fixture has a valid PNG signature", async () => {
  const SIGNATURE = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  for (const name of EXPECTED_FILES) {
    const buf = await readFixture(name);
    assert.ok(
      buf.length >= 8,
      `${name} should be at least 8 bytes`,
    );
    assert.deepEqual(
      buf.subarray(0, 8),
      Buffer.from(SIGNATURE),
      `${name} should start with a valid PNG signature`,
    );
  }
});

test("each fixture ends with an IEND chunk", async () => {
  for (const name of EXPECTED_FILES) {
    const buf = await readFixture(name);
    // IEND chunk: 4 bytes length (0x00000000) + "IEND" + 4 bytes CRC
    assert.ok(buf.length >= 12, `${name} should be at least 12 bytes`);
    const tail = buf.subarray(-12);
    assert.equal(tail.readUInt32BE(0), 0, `${name} IEND chunk should have 0 length`);
    assert.equal(
      tail.toString("ascii", 4, 8),
      "IEND",
      `${name} should end with an IEND chunk`,
    );
  }
});

// ── 3. Determinism: re-run the generator and compare bytes ─────────

test("generator produces byte-identical output on re-run", async () => {
  // Capture hashes of current fixtures
  const before = new Map<string, string>();
  for (const name of EXPECTED_FILES) {
    before.set(
      name,
      crypto.createHash("sha256").update(await readFixture(name)).digest("hex"),
    );
  }

  // Re-run the generator
  execFileSync(process.execPath, ["--experimental-strip-types", SCRIPT_PATH], {
    stdio: "pipe",
  });

  // Compare
  for (const name of EXPECTED_FILES) {
    const after = crypto
      .createHash("sha256")
      .update(await readFixture(name))
      .digest("hex");
    assert.equal(
      after,
      before.get(name),
      `${name} should be byte-identical after regeneration`,
    );
  }
});

// ── 4. Privacy: no EXIF / GPS / textual metadata chunks ────────────

test("no fixture contains EXIF or GPS metadata chunks", async () => {
  for (const name of EXPECTED_FILES) {
    const buf = await readFixture(name);
    // Scan for known metadata chunk types in the raw bytes
    assert.ok(
      !buf.includes(Buffer.from("eXIf")),
      `${name} should not contain an eXIf chunk`,
    );
    assert.ok(
      !buf.includes(Buffer.from("tEXt")),
      `${name} should not contain a tEXt chunk`,
    );
    assert.ok(
      !buf.includes(Buffer.from("iTXt")),
      `${name} should not contain an iTXt chunk`,
    );
    assert.ok(
      !buf.includes(Buffer.from("zTXt")),
      `${name} should not contain a zTXt chunk`,
    );
    assert.ok(
      !buf.includes(Buffer.from("GPS")),
      `${name} should not contain GPS data`,
    );
  }
});

// ── 5. Total size under 200 KB ──────────────────────────────────────

test("total fixture size is under 200 KB", async () => {
  let total = 0;
  for (const name of EXPECTED_FILES) {
    total += (await stat(path.join(FIXTURES_DIR, name))).size;
  }
  assert.ok(
    total < 200 * 1024,
    `total fixture size ${total} bytes should be under 200 KB`,
  );
});
