# SafetySecretary API (MVP)

This project scaffolds the backend for the SafetySecretary risk assessment flow described in `brief.txt`. It provides:

- Express + TypeScript HTTP API mounted at `/api/ra-cases`
- Persistence via Prisma + Postgres (steps, hazards, actions)
- LLM helper service for extracting steps/hazards (OpenAI with deterministic fallbacks)
- Simple PDF export for each risk assessment case

## Quick Start

1. Copy the example environment file and set your keys:
   ```bash
   cp .env.example .env
   # add OPENAI_API_KEY (optional for LLM extraction) and tweak DATABASE_URL if needed
   ```
2. Boot Postgres via Docker Compose (defaults match `.env.example`):
   ```bash
   docker compose up -d db
   ```
3. Install dependencies for both the backend and the Vite frontend (the `postinstall` script handles the latter automatically):
   ```bash
   npm install
   ```
4. Apply the Prisma migrations:
   ```bash
   npm run db:migrate
   ```
5. Run everything (Express API on :4000 + Vite dev server on :5173) with a single command:
   ```bash
   npm run dev
   ```
   The browser UI now has a **New case** button so you can create/seed a `RiskAssessmentCase` without touching curl or Postman. Loading an existing case is still available via the ID form. LLM extractions now run asynchronously—each request enqueues a job, the UI polls `/api/llm-jobs/:id`, and the case refreshes automatically once the job completes.

> Need to run just one side? Use `npm run dev:server` (API only) or `npm run dev:client` (frontend only). Production builds run via `npm run build` which bundles both workspaces.

## Available Scripts

- `npm run dev` – start the Express server with `ts-node-dev`
- `npm run build` – type-check and emit JS to `dist`
- `npm run start` – run the compiled server
- `npm run lint` – TypeScript type check only

## Services Overview

- `RiskAssessmentService` – wraps all DB interactions (cases, steps, hazards, actions)
- `LlmService` – mediates OpenAI usage; provides heuristic fallback when no API key is set
- `LlmJobManager` – lightweight in-memory queue that runs steps/hazards extraction jobs off the request cycle
- `ReportService` – small PDF generator powered by `pdfkit`

Each service is attached to `app.locals` so the router remains thin and easy to test.

## Database Choice

Postgres is recommended for this workflow because we expect concurrent supervisors editing separate assessments, and eventual analytics/LLM feedback loops benefit from relational queries, JSON columns, and strong consistency. If you truly only need a single-user demo, you can temporarily switch the Prisma datasource provider to `sqlite` and update `DATABASE_URL` to `file:./dev.db`, but concurrent writes will be limited and you lose easy scaling to managed services. For production or shared pilots, stick with Postgres.

## Frontend Prototype

A minimal Vite + React + TypeScript SPA lives in `frontend/`. It keeps the UI small and composable without committing to a larger framework.

```bash
cd frontend
npm install
npm run dev    # http://localhost:5173 (proxies /api to :4000)
```

The app is built around a `RaProvider` context and `RaEditor` shell that:

- Loads a `RiskAssessmentCase`, exposes it via context, and renders the appropriate phase from a shared registry.
- Provides lightweight phase components for steps, hazards, risk ratings (before & after controls), controls capture, action planning, and review/export.
- Includes route-driven overlays for the Overview board (insert hazards/actions per step) and the risk matrix view.
- Uses the same backend endpoints documented above via the browser Fetch API.

This strikes the balance discussed in the brief: React is familiar to LLM devs, keeps complex phase state manageable, and avoids inventing a custom frontend framework.

## LLM Usage & Fallbacks

Add `OPENAI_API_KEY` to enable live extraction. When the key is missing or the API fails, the service degrades gracefully by splitting the text into steps/hazards heuristically so the UI can keep flowing. Extraction jobs are queued so the API responds immediately; poll `/api/llm-jobs/:id` (handled automatically by the frontend) to wait for completion.

## PDF Export

`GET /api/ra-cases/:id/export/pdf` streams a lightweight summary PDF. Replace `ReportService` with a richer templating stack (e.g. HTML -> Playwright) when ready.

## Testing

- `npm run test` – backend Vitest suite (includes supertest coverage for the routers)
- `npm run test:frontend` – Vite/Vitest + Testing Library suite for key components
