# Validation Commands

Canonical downstream contract. Each bead must leave all of these passing.

| Command | Success criterion |
|---|---|
| `pnpm install` | exits 0, no peer-dependency conflicts |
| `DATABASE_URL=postgresql://... pnpm test` | exits 0, includes the ADR-0001 Gate A T1-T20 tenancy battery |
| `pnpm typecheck` | exits 0, no TypeScript errors |
| `pnpm lint` | exits 0, no Biome lint violations |
| `pnpm build` | exits 0, all static pages generated |
| `pnpm dev` | starts on `http://localhost:3000`, serves `/` with HTTP 200 |
| `pnpm prisma validate` | exits 0, schema is valid |
| `pnpm db:migrate --dry-run` | exits 0, no migration errors |
| `DATABASE_URL=postgresql://... pnpm test:tenancy` | runs the ADR-0001 Gate A T1-T20 tenant isolation, invite/membership, and session-security battery |
