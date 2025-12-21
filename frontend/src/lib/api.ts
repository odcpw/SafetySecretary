import { notifySessionExpired } from "@/lib/sessionEvents";
import { notifyTenantUnavailable } from "@/lib/tenantEvents";

export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const response = await fetch(input, { ...init, credentials: init?.credentials ?? "include" });
  if (response.status === 401) {
    notifySessionExpired();
  }
  if (response.status === 503) {
    const clone = response.clone();
    const contentType = clone.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = await clone.json().catch(() => null);
      if (payload?.code === "TENANT_UNAVAILABLE") {
        notifyTenantUnavailable();
      }
    }
  }
  return response;
};
