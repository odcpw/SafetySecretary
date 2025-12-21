# SafetySecretary Quick Start

Spin up the full MVP (Postgres + API + React UI) in a few commands.

## 1. Prerequisites

- Node.js 20+
- Docker + Docker Compose
- OpenAI API key (optional; without it the backend falls back to heuristic step/hazard extraction)

## 2. Boot Postgres

```bash
npm run db:up
```

This starts a Postgres 16 instance with credentials matching `.env.example`.

## 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` to set:

- `DATABASE_URL` if you changed the DB creds/port
- `OPENAI_API_KEY` so the extractor endpoints call OpenAI instead of the fallback heuristics

## 4. Install Dependencies

```bash
npm install
```

The root `postinstall` runs `npm install --prefix frontend`, so both the API and the Vite app are ready.

## 5. Apply Database Schema

```bash
npm run db:migrate
```

This runs `prisma migrate deploy` against the Postgres instance using the pre-generated migration in `prisma/migrations/`.

If you hit a Prisma `P3018` migration error on a fresh setup, wipe the local Postgres volume and try again:

```bash
npm run db:down -- -v
npm run db:up
npm run db:migrate
```

## 6. Launch Everything

```bash
npm run dev
```

If you see `Can't reach database server at localhost:5432`, Postgres is not running. Run `npm run db:up` and try again.

This runs the Express API on `http://localhost:4000` and the Vite dev server on `http://localhost:5173` (proxying `/api` to the backend). LLM-powered extractions now run asynchronously—each request enqueues a job, the UI polls `/api/llm-jobs/:id`, and the case refreshes automatically when the job completes.

## 7. Create or Load a Case

1. Open `http://localhost:5173`.
2. Click **New case** to seed a `RiskAssessmentCase` (activity name required; location/team optional). The UI automatically loads the wizard for the new ID.
3. Alternatively, paste an existing `caseId` into the “Load existing case” form. The ID is kept in the query string so you can refresh/share the URL.

You can now walk through all MVP phases: describe process steps, run hazard extraction, add manual hazards, rate severity/likelihood, log actions, and export the PDF.

## Useful Commands

```bash
# Run backend only
npm run dev:server

# Run frontend only
npm run dev:client

# Build both workspaces
npm run build

# Type-check backend
npm run lint

# Lint frontend (ESLint)
npm run lint:frontend

# Backend tests (Vitest + supertest)
npm run test

# Frontend component tests (Vitest + Testing Library)
npm run test:frontend
```
