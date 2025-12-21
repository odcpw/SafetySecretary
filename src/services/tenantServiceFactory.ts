import { IncidentService } from "./incidentService";
import { JhaService } from "./jhaService";
import { RiskAssessmentService } from "./raService";
import { TenantDbManager } from "./tenantDbManager";

export type TenantServices = {
  raService: RiskAssessmentService;
  jhaService: JhaService;
  incidentService: IncidentService;
};

export class TenantServiceFactory {
  constructor(private readonly tenantDb: TenantDbManager) {}

  getServices(connectionString: string): TenantServices {
    const client = this.tenantDb.getClient(connectionString);
    return {
      raService: new RiskAssessmentService(client),
      jhaService: new JhaService(client),
      incidentService: new IncidentService(client)
    };
  }
}
