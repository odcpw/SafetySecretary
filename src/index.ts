import { createApp } from "./app";
import { env } from "./config/env";
import { RiskAssessmentService } from "./services/raService";
import { LlmService } from "./services/llmService";
import { ReportService } from "./services/reportService";
import { LlmJobManager } from "./services/llmJobManager";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const main = async () => {
  const app = createApp();

  const raService = new RiskAssessmentService();
  const llmService = new LlmService();
  const reportService = new ReportService();
  const llmJobManager = new LlmJobManager(raService, llmService);

  const waitForDatabase = async () => {
    const timeoutMs = 30_000;
    const intervalMs = 1_000;
    const deadline = Date.now() + timeoutMs;
    let attempt = 0;

    while (true) {
      attempt += 1;
      try {
        await raService.connect();
        return;
      } catch (error) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          throw error;
        }
        if (attempt === 1) {
          console.error(
            `[startup] Database connection failed. Start Postgres (docker compose up -d db) then apply migrations (npm run db:migrate). Retrying for ${Math.round(
              timeoutMs / 1000
            )}s…`
          );
        }
        await sleep(intervalMs);
      }
    }
  };

  await waitForDatabase();

  app.locals.raService = raService;
  app.locals.llmService = llmService;
  app.locals.reportService = reportService;
  app.locals.llmJobManager = llmJobManager;

  const server = app.listen(env.port, () => {
    console.log(`SafetySecretary API listening on http://localhost:${env.port}`);
  });

  const shutdown = () => {
    server.close(async () => {
      await raService.disconnect();
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
};

void main().catch((error) => {
  console.error("[startup] Fatal error", error);
  process.exit(1);
});
