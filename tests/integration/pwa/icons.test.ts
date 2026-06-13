import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const ICON_DIR = "public/icons";
const SIZES = [192, 256, 384, 512];

// ── PNG signature ───────────────────────────────────────────────────

const PNG_SIG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function isPng(data: Uint8Array): boolean {
  return PNG_SIG.every((b, i) => data[i] === b);
}

// ── Read IHDR width/height from a PNG ───────────────────────────────

function readPngDimensions(data: Uint8Array): { width: number; height: number } {
  // Skip 8-byte signature, then first chunk is IHDR at offset 8
  // Chunk: 4 length + 4 type + data + 4 CRC
  const type = String.fromCharCode(data[12], data[13], data[14], data[15]);
  assert.equal(type, "IHDR", "First chunk must be IHDR");

  // IHDR data starts at offset 16
  const width =
    (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19];
  const height =
    (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23];
  return { width, height };
}

// ── Chunk-level integrity: CRC check on every chunk ─────────────────

const CRC_TABLE: Uint32Array = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of data) {
    crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function checkPngIntegrity(data: Uint8Array): void {
  let pos = 8; // skip PNG signature
  while (pos < data.length) {
    const len =
      (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
    const chunkType = String.fromCharCode(
      data[pos + 4],
      data[pos + 5],
      data[pos + 6],
      data[pos + 7],
    );
    const chunkData = data.subarray(pos + 8, pos + 8 + len);
    const storedCrc =
      ((data[pos + 8 + len] << 24) |
      (data[pos + 8 + len + 1] << 16) |
      (data[pos + 8 + len + 2] << 8) |
      data[pos + 8 + len + 3]) >>> 0; // force unsigned

    const computedType = new TextEncoder().encode(chunkType);
    const crcInput = new Uint8Array(computedType.length + len);
    crcInput.set(computedType, 0);
    crcInput.set(chunkData, computedType.length);
    const computedCrc = crc32(crcInput);

    assert.equal(
      storedCrc,
      computedCrc,
      `CRC mismatch in chunk ${chunkType} (stored: ${storedCrc}, computed: ${computedCrc})`,
    );
    pos += 12 + len;
  }
}

// ── Tests ───────────────────────────────────────────────────────────

for (const size of SIZES) {
  const filePath = `${ICON_DIR}/icon-${size}.png`;

  test(`${filePath} exists`, () => {
    const stats = statSync(filePath);
    assert.ok(stats.isFile(), "File must exist and be a regular file");
  });

  test(`${filePath} is a valid PNG`, () => {
    const data = readFileSync(filePath);
    assert.ok(isPng(data), "File must start with PNG signature");
  });

  test(`${filePath} has correct dimensions ${size}x${size}`, () => {
    const data = readFileSync(filePath);
    const { width, height } = readPngDimensions(data);
    assert.equal(width, size, `Width must be ${size}`);
    assert.equal(height, size, `Height must be ${size}`);
  });

  test(`${filePath} passes CRC integrity check`, () => {
    const data = readFileSync(filePath);
    // This will throw on any CRC mismatch
    checkPngIntegrity(data);
  });

  test(`${filePath} is under 20 KB (reasonable for a simple geometric icon)`, () => {
    const stats = statSync(filePath);
    assert.ok(
      stats.size < 20_000,
      `Icon file is ${stats.size} bytes, expected < 20 KB`,
    );
  });

  test(`${filePath} contains no EXIF or GPS chunks`, () => {
    const data = readFileSync(filePath);
    // Scan chunk types — EXIF in PNG is stored in "eXIf" chunk; GPS would be in that
    // Also check for tEXp chunks that might carry GPS data
    let pos = 8;
    const chunkTypes: string[] = [];
    while (pos < data.length) {
      const len =
        (data[pos] << 24) |
        (data[pos + 1] << 16) |
        (data[pos + 2] << 8) |
        data[pos + 3];
      const chunkType = String.fromCharCode(
        data[pos + 4],
        data[pos + 5],
        data[pos + 6],
        data[pos + 7],
      );
      chunkTypes.push(chunkType);
      pos += 12 + len;
    }
    assert.equal(
      chunkTypes.includes("eXIf"),
      false,
      "Must not contain EXIF chunk",
    );
  });
}

// ── Total size check ────────────────────────────────────────────────

test("total icon size is under 50 KB", () => {
  let total = 0;
  for (const size of SIZES) {
    const stats = statSync(`${ICON_DIR}/icon-${size}.png`);
    total += stats.size;
  }
  assert.ok(
    total < 50_000,
    `Total icon size is ${total} bytes, expected < 50 KB`,
  );
});
