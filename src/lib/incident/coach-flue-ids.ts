const flueIncidentInstancePrefix = "ii1_";

export type FlueIncidentInstance = {
	readonly tenantId: string;
	readonly incidentId: string;
};

export function encodeFlueIncidentInstanceId(input: FlueIncidentInstance): string {
	return `${flueIncidentInstancePrefix}${Buffer.from(
		JSON.stringify({
			i: input.incidentId,
			t: input.tenantId,
		}),
		"utf8",
	).toString("base64url")}`;
}

export function decodeFlueIncidentInstanceId(
	value: string,
): FlueIncidentInstance | null {
	if (!value.startsWith(flueIncidentInstancePrefix)) {
		return null;
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(
			Buffer.from(
				value.slice(flueIncidentInstancePrefix.length),
				"base64url",
			).toString("utf8"),
		);
	} catch {
		return null;
	}

	if (!parsed || typeof parsed !== "object") {
		return null;
	}

	const record = parsed as Record<string, unknown>;
	const tenantId = typeof record.t === "string" ? record.t : "";
	const incidentId = typeof record.i === "string" ? record.i : "";

	if (!isUuid(tenantId) || !isUuid(incidentId)) {
		return null;
	}

	return { incidentId, tenantId };
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	);
}
