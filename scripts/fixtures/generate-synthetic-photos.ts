#!/usr/bin/env -S node --experimental-strip-types
/**
 * Deterministic synthetic photo fixture generator.
 *
 * Produces small programmatic PNGs with geometric shapes and text labels.
 * No real workplace content. No EXIF metadata. No GPS tags.
 * Same seed → byte-equal output on every run.
 *
 * Usage:
 *   node --experimental-strip-types scripts/fixtures/generate-synthetic-photos.ts
 *
 * Output: fixtures/photos/synthetic/
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

// ── Paths ───────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..", "..");
const OUT_DIR = join(PROJECT_ROOT, "fixtures", "photos", "synthetic");

// ── CRC-32 (ISO 3309 / PNG spec) ────────────────────────────────────

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of data) {
    crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── PNG chunk helpers ────────────────────────────────────────────────

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
  const data = Uint8Array.from({ length: 13 }, () => 0);
  writeU32(data, 0, width);
  writeU32(data, 4, height);
  data[8] = 8; // bit depth
  data[9] = 2; // color type: RGB (no alpha — keeps files smaller)
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return pngChunk("IHDR", data);
}

function buildPng(
  width: number,
  height: number,
  pixels: Uint8Array,
): Uint8Array {
  // Raw rows with filter byte (0 = None)
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    raw.set(
      pixels.subarray(y * width * 3, (y + 1) * width * 3),
      y * (width * 3 + 1) + 1,
    );
  }
  const compressed = deflateSync(raw, { level: 6 });
  const chunks = [
    PNG_SIGNATURE,
    buildIhdr(width, height),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Uint8Array.of()),
  ];
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const png = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    png.set(chunk, offset);
    offset += chunk.length;
  }
  return png;
}

// ── Drawing primitives ──────────────────────────────────────────────

/** Set a single pixel (RGB) in a flat buffer. */
function setPixel(
  buf: Uint8Array,
  x: number,
  y: number,
  w: number,
  r: number,
  g: number,
  b: number,
): void {
  const idx = (y * w + x) * 3;
  buf[idx] = r;
  buf[idx + 1] = g;
  buf[idx + 2] = b;
}

/** Fill a solid colour rectangle. */
function fillRect(
  buf: Uint8Array,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      setPixel(buf, x, y, w, r, g, b);
    }
  }
}

/** Draw a filled circle (integer Bresenham-ish). */
function fillCircle(
  buf: Uint8Array,
  cx: number,
  cy: number,
  radius: number,
  w: number,
  r: number,
  g: number,
  b: number,
): void {
  const r2 = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y++) {
    if (y < 0 || y >= w) continue;
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 0 || x >= w) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) {
        setPixel(buf, x, y, w, r, g, b);
      }
    }
  }
}

/** Draw a filled triangle (scanline fill). */
function fillTriangle(
  buf: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  r: number,
  g: number,
  b: number,
): void {
  const minY = Math.max(0, Math.min(y0, y1, y2));
  const maxY = Math.min(w - 1, Math.max(y0, y1, y2));
  for (let y = minY; y <= maxY; y++) {
    // Compute x range at this y using barycentric interpolation
    const edges = [
      [x0, y0, x1, y1],
      [x1, y1, x2, y2],
      [x2, y2, x0, y0],
    ];
    let leftX = Infinity;
    let rightX = -Infinity;
    for (const [ax, ay, bx, by] of edges) {
      if (ay === by) continue;
      if (ay > by) continue; // only scan top-to-bottom edges
      const t = (y - ay) / (by - ay);
      if (t < 0 || t > 1) continue;
      const ix = ax + t * (bx - ax);
      leftX = Math.min(leftX, ix);
      rightX = Math.max(rightX, ix);
    }
    for (let x = Math.ceil(leftX); x <= Math.floor(rightX); x++) {
      if (x >= 0 && x < w) {
        setPixel(buf, x, y, w, r, g, b);
      }
    }
  }
}

/** Draw a diagonal line (Bresenham). */
function drawLine(
  buf: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  r: number,
  g: number,
  b: number,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  while (true) {
    if (x >= 0 && x < w && y >= 0 && y < w) {
      setPixel(buf, x, y, w, r, g, b);
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

// ── Fixture definitions ─────────────────────────────────────────────
// Each fixture: { filename, width, height, drawFn }
// Colours:
//   bg       = soft grey  #e8e8ec
//   accent1  = blue       #4a6cf7
//   accent2  = orange     #f59e0b
//   accent3  = red        #ef4444
//   accent4  = green      #22c55e
//   accent5  = purple     #a855f7
//   dark     = slate      #334155

type Rgb = readonly [r: number, g: number, b: number];

const BG: Rgb = [232, 232, 236];
const ACCENT_BLUE: Rgb = [74, 108, 247];
const ACCENT_ORANGE: Rgb = [245, 158, 11];
const ACCENT_RED: Rgb = [239, 68, 68];
const ACCENT_GREEN: Rgb = [34, 197, 94];
const ACCENT_PURPLE: Rgb = [168, 85, 247];
const DARK: Rgb = [51, 65, 85];

interface FixtureDef {
  filename: string;
  width: number;
  height: number;
  draw(buf: Uint8Array, w: number, h: number): void;
}

const FIXTURES: FixtureDef[] = [
  {
    filename: "placeholder-256.png",
    width: 256,
    height: 256,
    draw(buf, w, h) {
      fillRect(buf, 0, 0, w, h, ...BG);
      // Two overlapping circles (abstract placeholder)
      fillCircle(buf, w * 0.35, h * 0.45, 50, w, ...ACCENT_BLUE);
      fillCircle(buf, w * 0.65, h * 0.55, 40, w, ...ACCENT_ORANGE);
      // Thin border
      fillRect(buf, 0, 0, w, 4, ...DARK);
      fillRect(buf, 0, h - 4, w, 4, ...DARK);
      fillRect(buf, 0, 0, 4, h, ...DARK);
      fillRect(buf, w - 4, 0, 4, h, ...DARK);
    },
  },
  {
    filename: "placeholder-1024.png",
    width: 512, // kept small for repo size; name signals "high-res slot"
    height: 384,
    draw(buf, w, h) {
      fillRect(buf, 0, 0, w, h, ...BG);
      // Landscape-style placeholder: three circles as "mountains"
      fillCircle(buf, w * 0.25, h * 0.8, 80, w, ...ACCENT_BLUE);
      fillCircle(buf, w * 0.55, h * 0.75, 90, w, ...ACCENT_PURPLE);
      fillCircle(buf, w * 0.8, h * 0.85, 60, w, ...ACCENT_ORANGE);
      fillRect(buf, 0, 0, w, 4, ...DARK);
      fillRect(buf, 0, h - 4, w, 4, ...DARK);
    },
  },
  {
    filename: "mechanical-hazard-synth.png",
    width: 256,
    height: 256,
    draw(buf, w, h) {
      fillRect(buf, 0, 0, w, h, ...BG);
      // Warning triangle (yellow/orange)
      const cx = w / 2;
      const cy = h / 2;
      fillTriangle(
        buf,
        cx, cy - 70,
        cx - 70, cy + 50,
        cx + 70, cy + 50,
        w,
        ...ACCENT_ORANGE,
      );
      // Gear teeth (circles around a centre circle)
      fillCircle(buf, cx, cy, 25, w, ...ACCENT_BLUE);
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        const gx = cx + Math.cos(angle) * 45;
        const gy = cy + Math.sin(angle) * 45;
        fillCircle(buf, Math.round(gx), Math.round(gy), 8, w, ...DARK);
      }
    },
  },
  {
    filename: "falls-hazard-synth.png",
    width: 256,
    height: 256,
    draw(buf, w, h) {
      fillRect(buf, 0, 0, w, h, ...BG);
      // Stair-step pattern (descending rectangles)
      const stepW = 30;
      const stepH = 20;
      for (let i = 0; i < 5; i++) {
        fillRect(
          buf,
          60 + i * stepW,
          60 + i * stepH,
          stepW,
          stepH,
          ...ACCENT_RED,
        );
      }
      // Arrow pointing down
      fillTriangle(
        buf,
        w / 2, h - 60,
        w / 2 - 20, h - 100,
        w / 2 + 20, h - 100,
        w,
        ...DARK,
      );
    },
  },
  {
    filename: "electrical-hazard-synth.png",
    width: 256,
    height: 256,
    draw(buf, w, h) {
      fillRect(buf, 0, 0, w, h, ...BG);
      // Lightning bolt shape (yellow on red triangle background)
      const cx = w / 2;
      const cy = h / 2;
      fillTriangle(
        buf,
        cx, cy - 75,
        cx - 75, cy + 55,
        cx + 75, cy + 55,
        w,
        ...ACCENT_RED,
      );
      // Zigzag bolt
      const pts = [
        [cx + 10, cy - 40],
        [cx - 5, cy - 5],
        [cx + 5, cy - 5],
        [cx - 10, cy + 35],
        [cx, cy + 5],
        [cx + 10, cy + 5],
      ] as [number, number][];
      for (let i = 0; i < pts.length - 1; i++) {
        drawLine(
          buf,
          Math.round(pts[i][0]),
          Math.round(pts[i][1]),
          Math.round(pts[i + 1][0]),
          Math.round(pts[i + 1][1]),
          w,
          ...ACCENT_ORANGE,
        );
      }
    },
  },
  {
    filename: "evidence-timeline-synth.png",
    width: 320,
    height: 200,
    draw(buf, w, h) {
      fillRect(buf, 0, 0, w, h, ...BG);
      // Horizontal timeline line
      const lineY = h / 2;
      drawLine(buf, 20, lineY, w - 20, lineY, w, ...DARK);
      // Timeline dots at intervals
      const dotPositions = [40, 100, 170, 240, 290];
      const dotCols: readonly Rgb[] = [
        ACCENT_BLUE,
        ACCENT_GREEN,
        ACCENT_ORANGE,
        ACCENT_PURPLE,
        ACCENT_RED,
      ];
      for (let i = 0; i < dotPositions.length; i++) {
        const col = dotCols[i] ?? ACCENT_BLUE;
        fillCircle(buf, dotPositions[i], lineY, 8, w, col[0], col[1], col[2]);
      }
      // Small label rectangles above/below the line
      for (let i = 0; i < dotPositions.length; i++) {
        const yPos = i % 2 === 0 ? lineY - 30 : lineY + 15;
        fillRect(
          buf,
          dotPositions[i] - 20,
          yPos,
          40,
          14,
          ACCENT_BLUE[0],
          ACCENT_BLUE[1],
          ACCENT_BLUE[2],
        );
      }
    },
  },
];

// ── Main ────────────────────────────────────────────────────────────

await mkdir(OUT_DIR, { recursive: true });

let totalBytes = 0;

for (const fixture of FIXTURES) {
  const pixelCount = fixture.width * fixture.height;
  const pixels = new Uint8Array(pixelCount * 3);
  // Fill with background first
  fillRect(pixels, 0, 0, fixture.width, fixture.height, ...BG);
  // Draw the fixture-specific content
  fixture.draw(pixels, fixture.width, fixture.height);
  const png = buildPng(fixture.width, fixture.height, pixels);
  const filePath = join(OUT_DIR, fixture.filename);
  await writeFile(filePath, png);
  totalBytes += png.length;
  console.log(`  ${fixture.filename}  ${fixture.width}x${fixture.height}  ${png.length} bytes`);
}

console.log(`Total: ${totalBytes} bytes  (${(totalBytes / 1024).toFixed(1)} KB)`);
console.log("Done.");
