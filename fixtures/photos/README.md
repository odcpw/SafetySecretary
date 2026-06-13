# Synthetic Photo Fixtures

These are **programmatic placeholder images** — geometric shapes and abstract patterns generated with a deterministic script.

## No-real-photos rule

- No recognisable workplace content.
- No real photos, no real company data, no real incidents.
- No EXIF metadata, no GPS tags, no embedded textual metadata.
- Satisfies ADR-0005 D8 / Privacy checklist line 3.

## Fixtures

| File | Dimensions | Purpose |
|---|---|---|
| `synthetic/placeholder-256.png` | 256×256 | Generic placeholder (compact) |
| `synthetic/placeholder-1024.png` | 512×384 | Generic placeholder (landscape slot) |
| `synthetic/mechanical-hazard-synth.png` | 256×256 | Mechanical hazard category illustration |
| `synthetic/falls-hazard-synth.png` | 256×256 | Falls hazard category illustration |
| `synthetic/electrical-hazard-synth.png` | 256×256 | Electrical hazard category illustration |
| `synthetic/evidence-timeline-synth.png` | 320×200 | Incident investigation timeline placeholder |

Total size: ~6 KB (well under the 200 KB repo budget).

## Regeneration

```bash
node --experimental-strip-types scripts/fixtures/generate-synthetic-photos.ts
```

The generator is **deterministic**: same seed → byte-identical output.
No randomness, no timestamps, no environment-dependent paths.

## Technical notes

- Pure Node.js — uses only `zlib`, `fs`, `path`, `url` (stdlib).
- PNGs contain only `IHDR` + `IDAT` + `IEND` chunks (no metadata).
- RGB colour mode (no alpha channel).
- Generator lives at `scripts/fixtures/generate-synthetic-photos.ts`.
