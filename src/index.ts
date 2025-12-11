import { createApp } from "./app";
import { env } from "./config/env";
import { RiskAssessmentService } from "./services/raService";
import { LlmService } from "./services/llmService";
import { ReportService } from "./services/reportService";
import { LlmJobManager } from "./services/llmJobManager";

const app = createApp();

const raService = new RiskAssessmentService();
const llmService = new LlmService();
const reportService = new ReportService();
const llmJobManager = new LlmJobManager(raService, llmService);

app.locals.raService = raService;
app.locals.llmService = llmService;
app.locals.reportService = reportService;
app.locals.llmJobManager = llmJobManager;

const server = app.listen(env.port, () => {
  console.log(`SafetySecretary API listening on http://localhost:${env.port}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
