import type { OrgAuthContext, PlatformAuthContext } from "./auth";
import type { TenantServices } from "../services/tenantServiceFactory";

declare global {
  namespace Express {
    interface Request {
      auth?: OrgAuthContext;
      platformAuth?: PlatformAuthContext;
      tenantServices?: TenantServices;
      authSessionId?: string;
      platformSessionId?: string;
    }
  }
}

export {};
