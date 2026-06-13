#!/usr/bin/env -S node --experimental-strip-types
/**
 * Deterministic PWA icon generator.
 *
 * Produces four brand-neutral placeholder PNGs (192, 256, 384, 512) with a
 * simple geometric mark: a filled circle with a smaller cut-out circle
 * (ring / donut shape) in the dark-accent palette.
 *
 * Uses only Node stdlib (zlib, crypto for crc32, fs, path).
 * Same run → byte-equal output (no timestamps, no random seeds).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

// ── CRC-32 (ISO 3309 / PNG spec) ───────────────────────────────────

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

// ── PNG helpers ─────────────────────────────────────────────────────

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function writeU32(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const len = data.length;
  const chunk = new Uint8Array(4 + 4 + len + 4);
  writeU32(chunk, 0, len);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeU32(chunk, 8 + len, crc32(new Uint8Array(chunk.subarray(4, 8 + len))));
  return chunk;
}

function buildIhdr(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  writeU32(data, 0, width);
  writeU32(data, 4, height);
  data[8] = 8;   // bit depth
  data[9] = 6;   // color type: RGBA
  data[10] = 0;  // compression
  data[11] = 0;  // filter
  data[12] = 0;  // interlace
  return pngChunk("IHDR", data);
}

// ── Pixel drawing ───────────────────────────────────────────────────

/**
 * Draw a deterministic geometric mark onto a raw RGBA pixel buffer.
 *
 * Mark: a large filled circle in the accent colour (#7b83ff) centred in the
 * icon, with a smaller concentric cut-out (transparent hole) — a ring shape.
 * Background is the dark surface colour (#16161a).
 */
function drawIcon(pixels: Uint8Array, size: number): void {
  const cx = size / 2;
  const cy = size / 2;

  // Outer ring radius: 0.40 * size, inner cut-out: 0.18 * size
  const outerR2 = (size * 0.4) * (size * 0.4);
  const innerR2 = (size * 0.18) * (size * 0.18);

  // Accent: #7b83ff → r=123 g=131 b=255
  const accentR = 123;
  const accentG = 131;
  const accentB = 255;

  // Background: #16161a → r=22 g=22 b=26
  const bgR = 22;
  const bgG = 22;
  const bgB = 26;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist2 = dx * dx + dy * dy;

      const idx = (y * size + x) * 4;

      if (dist2 <= outerR2 && dist2 >= innerR2) {
        // Ring pixel
        pixels[idx] = accentR;
        pixels[idx + 1] = accentG;
        pixels[idx + 2] = accentB;
        pixels[idx + 3] = 255; // opaque
      } else {
        // Background
        pixels[idx] = bgR;
        pixels[idx + 1] = bgG;
        pixels[idx + 2] = bgB;
        pixels[idx + 3] = 255; // opaque
      }
    }
  }
}

// ── Build a complete PNG from pixel data ────────────────────────────

function buildPng(width: number, height: number, pixels: Uint8Array): Uint8Array {
  // Build raw image data with filter bytes (0 = None for every row)
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter byte: None
    raw.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }

  // Compress with zlib (deterministic: no random seed, same level)
  const compressed = deflateSync(raw, { level: 6 });

  // Assemble PNG
  const chunks = [
    PNG_SIGNATURE,
    buildIhdr(width, height),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array(0)),
  ];

  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
  const png = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    png.set(chunk, offset);
    offset += chunk.length;
  }
  return png;
}

// ── Main ────────────────────────────────────────────────────────────

const SIZES = [192, 256, 384, 512];
const OUT_DIR = "public/icons";

mkdirSync(OUT_DIR, { recursive: true });

for (const size of SIZES) {
  const pixels = new Uint8Array(size * size * 4);
  drawIcon(pixels, size);
  const png = buildPng(size, size, pixels);
  const filePath = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(filePath, png);
  console.log(`  ${filePath}  ${png.length} bytes`);
}

console.log("Done.");
