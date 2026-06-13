type RouteStubCall = {
	readonly generator: string;
	readonly options: Record<string, unknown>;
	readonly source: Record<string, unknown>;
};

export async function generateIIReportDocx(
	source: Record<string, unknown>,
	options: Record<string, unknown> = {},
): Promise<Uint8Array> {
	routeStubCalls().push({
		generator: "fullReportDocx",
		options,
		source,
	});

	return new TextEncoder().encode("stub full report docx");
}

export async function generateIIReportPdf(
	source: Record<string, unknown>,
	options: Record<string, unknown> = {},
): Promise<{ bytes: Uint8Array }> {
	routeStubCalls().push({
		generator: "fullReportPdf",
		options,
		source,
	});

	return { bytes: new TextEncoder().encode("stub full report pdf") };
}

export function iiReportFilename(caseId: string, format: "docx" | "pdf"): string {
	return `ii-full-report-${caseId}.${format}`;
}

function routeStubCalls(): RouteStubCall[] {
	const store = globalThis as typeof globalThis & {
		__ssfwIIExportRouteCalls?: RouteStubCall[];
	};

	store.__ssfwIIExportRouteCalls ??= [];

	return store.__ssfwIIExportRouteCalls;
}
