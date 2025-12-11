import { RiskAssessmentService } from "../services/raService";
import { LlmService } from "../services/llmService";
import { ReportService } from "../services/reportService";
import { LlmJobManager } from "../services/llmJobManager";

export interface AppLocals {
  raService: RiskAssessmentService;
  llmService: LlmService;
  reportService: ReportService;
  llmJobManager: LlmJobManager;
}
