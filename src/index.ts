import { createApp } from "./app";
import { env } from "./config/env";
import { RiskAssessmentService } from "./services/raService";
import { JhaService } from "./services/jhaService";
import { IncidentService } from "./services/incidentService";
import { LlmService } from "./services/llmService";
import { ReportService } from "./services/reportService";
import { LlmJobManager } from "./services/llmJobManager";
import { RegistryService } from "./services/registryService";
import { TenantDbManager } from "./services/tenantDbManager";
import { TenantServiceFactory } from "./services/tenantServiceFactory";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const main = async () => {
  const app = createApp();

  const raService = new RiskAssessmentService();
  const jhaService = new JhaService();
  const incidentService = new IncidentService();
  const llmService = new LlmService();
  const reportService = new ReportService();
  const registryService = new RegistryService();
  const tenantDbManager = new TenantDbManager();
  const tenantServiceFactory = new TenantServiceFactory(tenantDbManager);
  const llmJobManager = new LlmJobManager(tenantServiceFactory, llmService);

  const waitForDatabase = async () => {
    const timeoutMs = 30_000;
    const intervalMs = 1_000;
    const deadline = Date.now() + timeoutMs;
    let attempt = 0;

    while (true) {
      attempt += 1;
      try {
        await Promise.all([raService.connect(), registryService.connect()]);
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
  app.locals.jhaService = jhaService;
  app.locals.incidentService = incidentService;
  app.locals.llmService = llmService;
  app.locals.reportService = reportService;
  app.locals.llmJobManager = llmJobManager;
  app.locals.registryService = registryService;
  app.locals.tenantDbManager = tenantDbManager;
  app.locals.tenantServiceFactory = tenantServiceFactory;

  const server = app.listen(env.port, () => {
    console.log(`SafetySecretary API listening on http://localhost:${env.port}`);
  });

  const shutdown = () => {
    server.close(async () => {
      await raService.disconnect();
      await jhaService.disconnect();
      await incidentService.disconnect();
      await Promise.all([registryService.disconnect(), tenantDbManager.disconnectAll()]);
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
