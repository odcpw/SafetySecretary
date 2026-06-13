type RouteStubCall = {
	readonly generator: string;
	readonly options: Record<string, unknown>;
	readonly source: Record<string, unknown>;
};

export async function generateIICommsOnePagerDocx(
	source: Record<string, unknown>,
	options: Record<string, unknown> = {},
): Promise<Uint8Array> {
	routeStubCalls().push({
		generator: "commsOnePagerDocx",
		options,
		source,
	});

	return new TextEncoder().encode("stub comms docx");
}

export function iiCommsFilename(caseId: string): string {
	return `ii-comms-onepager-${caseId}.docx`;
}

function routeStubCalls(): RouteStubCall[] {
	const store = globalThis as typeof globalThis & {
		__ssfwIIExportRouteCalls?: RouteStubCall[];
	};

	store.__ssfwIIExportRouteCalls ??= [];

	return store.__ssfwIIExportRouteCalls;
}
