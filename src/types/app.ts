import { RiskAssessmentService } from "../services/raService";
import { JhaService } from "../services/jhaService";
import { LlmService } from "../services/llmService";
import { ReportService } from "../services/reportService";
import { LlmJobManager } from "../services/llmJobManager";
import { IncidentService } from "../services/incidentService";
import { RegistryService } from "../services/registryService";
import { TenantDbManager } from "../services/tenantDbManager";
import { TenantServiceFactory } from "../services/tenantServiceFactory";

export interface AppLocals {
  raService: RiskAssessmentService;
  jhaService: JhaService;
  llmService: LlmService;
  reportService: ReportService;
  llmJobManager: LlmJobManager;
  incidentService: IncidentService;
  registryService: RegistryService;
  tenantDbManager: TenantDbManager;
  tenantServiceFactory: TenantServiceFactory;
}
