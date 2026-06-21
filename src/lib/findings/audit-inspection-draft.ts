export type AuditInspectionDraftScope = {
	readonly tenantId: string;
	readonly userId: string;
};

const draftStorageKeyPrefix = "safetysecretary:audit-inspection-capture:v1";

export function auditInspectionDraftStorageKey(
	scope: AuditInspectionDraftScope,
): string {
	return [
		draftStorageKeyPrefix,
		encodeURIComponent(scope.tenantId),
		encodeURIComponent(scope.userId),
	].join(":");
}
