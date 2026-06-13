export const V1_ACTION_ORIGIN_TYPES = [
	"hira",
	"ii",
	"jha",
	"safety_walk",
	"audit_inspection",
	"toolbox_talk",
	"meeting",
	"manual",
] as const;

export const RESERVED_ACTION_ORIGIN_TYPES = [
	"safety_moment",
	"creative_artifact",
	"campaign",
	"roadmap",
	"safety_day",
] as const;

export const ACTION_ORIGIN_TYPES = [
	...V1_ACTION_ORIGIN_TYPES,
	...RESERVED_ACTION_ORIGIN_TYPES,
] as const;

export type ActionOriginType = (typeof ACTION_ORIGIN_TYPES)[number];

export type ActionOriginContext = {
	readonly activity?: string | null;
	readonly date?: Date | string | null;
	readonly location?: string | null;
	readonly processName?: string | null;
	readonly quarter?: string | null;
	readonly sourceLabel?: string | null;
	readonly stepLabel?: string | null;
	readonly theme?: string | null;
	readonly title?: string | null;
	readonly topic?: string | null;
};

export type ActionOriginInput = {
	readonly createdAt?: Date | string | null;
	readonly originContext?: ActionOriginContext | null;
	readonly originCreatedAt?: Date | string | null;
	readonly originId?: string | null;
	readonly originLabel?: string | null;
	readonly originType: ActionOriginType;
	readonly title?: string | null;
};

export type ActionOriginRecord = {
	readonly originCreatedAt: Date;
	readonly originId: string | null;
	readonly originLabel: string;
	readonly originType: ActionOriginType;
};

export class ActionOriginValidationError extends Error {
	readonly code = "invalid_action_origin";

	constructor(message: string) {
		super(message);
		this.name = new.target.name;
	}
}

export function isActionOriginType(value: unknown): value is ActionOriginType {
	return (
		typeof value === "string" &&
		(ACTION_ORIGIN_TYPES as readonly string[]).includes(value)
	);
}

export function prepareActionOriginForStorage(
	input: ActionOriginInput,
): ActionOriginRecord {
	if (!isActionOriginType(input.originType)) {
		throw new ActionOriginValidationError(
			`Unsupported action origin type: ${String(input.originType)}`,
		);
	}

	const originId =
		optionalText(input.originId, "originId")?.toLowerCase() ?? null;
	const originCreatedAt =
		optionalDate(input.originCreatedAt, "originCreatedAt") ??
		optionalDate(input.createdAt, "createdAt") ??
		new Date();
	const originLabel =
		optionalText(input.originLabel, "originLabel") ??
		buildOriginLabel(input.originType, originId, {
			...input.originContext,
			title: input.originContext?.title ?? input.title ?? null,
		});

	return {
		originCreatedAt,
		originId,
		originLabel: requiredText(originLabel, "originLabel"),
		originType: input.originType,
	};
}

export function buildOriginLabel(
	originType: ActionOriginType,
	originId?: string | null,
	context: ActionOriginContext = {},
): string {
	const idSuffix = originId ? ` (${originId})` : "";
	const dateSuffix = formatDateSuffix(context.date);
	const source =
		firstText(context.sourceLabel, context.title, context.activity) ??
		originId ??
		"unspecified";

	if (originType === "hira") {
		const process = firstText(context.processName, context.title, source);
		const step = firstText(context.stepLabel, context.activity);
		return step ? `HIRA: ${process} - ${step}` : `HIRA: ${process}${idSuffix}`;
	}

	if (originType === "ii") {
		return `II: ${source}${dateSuffix}`;
	}

	if (originType === "jha") {
		const job = firstText(context.activity, context.title, source);
		const location = firstText(context.location);
		return location ? `JHA: ${job} - ${location}` : `JHA: ${job}${idSuffix}`;
	}

	if (originType === "safety_walk") {
		const location = firstText(context.location, source);
		return `Safety walk: ${location}${dateSuffix}`;
	}

	if (originType === "audit_inspection") {
		return `Audit/inspection: ${source}${dateSuffix}`;
	}

	if (originType === "toolbox_talk") {
		return `Toolbox talk: ${source}${dateSuffix}`;
	}

	if (originType === "meeting") {
		return `Meeting: ${source}${dateSuffix}`;
	}

	if (originType === "manual") {
		return `Manual: ${source}`;
	}

	if (originType === "safety_moment") {
		return `Safety moment: ${source}${dateSuffix}`;
	}

	if (originType === "creative_artifact") {
		return `Creative artifact: ${source}${dateSuffix}`;
	}

	if (originType === "campaign") {
		return `Campaign: ${source}${dateSuffix}`;
	}

	if (originType === "roadmap") {
		const quarter = firstText(context.quarter);
		const topic = firstText(context.topic, source);
		return quarter
			? `Roadmap focus: ${quarter} - ${topic}`
			: `Roadmap focus: ${topic}`;
	}

	const theme = firstText(context.theme, source);
	return `Safety day: ${theme}${dateSuffix}`;
}

function firstText(
	...values: readonly (Date | string | null | undefined)[]
): string | null {
	for (const value of values) {
		if (value instanceof Date) {
			const formatted = formatDate(value);
			if (formatted) {
				return formatted;
			}
			continue;
		}

		const text = optionalText(value, "context");
		if (text) {
			return text;
		}
	}

	return null;
}

function formatDateSuffix(value: Date | string | null | undefined): string {
	const formatted =
		value instanceof Date ? formatDate(value) : optionalText(value, "date");
	return formatted ? ` (${formatted})` : "";
}

function formatDate(value: Date): string {
	return value.toISOString().slice(0, 10);
}

function requiredText(value: unknown, field: string): string {
	const text = optionalText(value, field);
	if (!text) {
		throw new ActionOriginValidationError(`${field} is required.`);
	}
	return text;
}

function optionalText(value: unknown, field: string): string | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (typeof value !== "string") {
		throw new ActionOriginValidationError(`${field} must be a string.`);
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function optionalDate(value: unknown, field: string): Date | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) {
			throw new ActionOriginValidationError(`${field} must be a valid date.`);
		}
		return value;
	}
	if (typeof value === "string") {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			throw new ActionOriginValidationError(`${field} must be a valid date.`);
		}
		return date;
	}
	throw new ActionOriginValidationError(
		`${field} must be a Date or ISO string.`,
	);
}
