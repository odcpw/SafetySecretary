import { recordCost, type CostStore } from "../../llm/cost";
import {
	dispatch,
	type DispatchOptions,
	type DispatchResult,
} from "../../llm/dispatch";
import { KindEnum, type LLMTextRequest } from "../../llm/types";
import type { Locale } from "../../i18n/types";
import type {
	SnapshotJson,
	WorkflowSnapshotData,
} from "../../incident/serialise";

export const II_STORED_CONTENT_TRANSLATION_PROMPT_PURPOSE =
	"ii.export.translateStoredContent";
export const II_STORED_CONTENT_TRANSLATION_REVIEW_MARKER =
	"translation, please review";

export type IIStoredContentTranslationContext = {
	readonly tenantId: string;
	readonly userId: string;
	readonly workflowId?: string;
	readonly dispatchOptions?: DispatchOptions;
	readonly costStore?: CostStore;
	readonly now?: () => Date;
};

export type IIStoredContentTranslationOptions = {
	readonly artifact: "commsOnePager" | "fullReport";
	readonly sourceLocale: Locale;
	readonly targetLocale: Locale;
	readonly translateStoredContent: boolean;
	readonly translationContext?: IIStoredContentTranslationContext;
};

type TranslationRuntime = {
	readonly cache: Map<string, string>;
	readonly options: RequiredTranslationOptions;
};

type RequiredTranslationOptions = Omit<
	IIStoredContentTranslationOptions,
	"artifact" | "translationContext"
> & {
	readonly translationContext: IIStoredContentTranslationContext;
};

export class IIStoredContentTranslationError extends Error {
	readonly dispatchResult?: DispatchResult;

	constructor(message: string, dispatchResult?: DispatchResult) {
		super(message);
		this.name = "IIStoredContentTranslationError";
		this.dispatchResult = dispatchResult;
	}
}

export async function translateIIWorkflowDataForExport(
	workflowData: WorkflowSnapshotData,
	options: IIStoredContentTranslationOptions,
): Promise<WorkflowSnapshotData> {
	if (
		!options.translateStoredContent ||
		options.sourceLocale === options.targetLocale
	) {
		return workflowData;
	}

	if (!options.translationContext) {
		throw new IIStoredContentTranslationError(
			"II stored-content translation requires tenant/user context.",
		);
	}

	const translated = structuredClone(workflowData) as WorkflowSnapshotData;
	const runtime: TranslationRuntime = {
		cache: new Map(),
		options: {
			sourceLocale: options.sourceLocale,
			targetLocale: options.targetLocale,
			translateStoredContent: options.translateStoredContent,
			translationContext: options.translationContext,
		},
	};

	const caseRecord = record(translated.case);

	await translateRecordString(caseRecord, "title", runtime);
	await translateRecordString(caseRecord, "location", runtime);
	await translateRecordString(caseRecord, "departmentText", runtime);
	await translateRecordString(caseRecord, "workActivity", runtime);
	await translateRecordString(caseRecord, "injuryNature", runtime);
	await translateRecordString(caseRecord, "bodyPart", runtime);
	await translateRecordString(caseRecord, "potentialOutcomeText", runtime);

	if (options.artifact === "fullReport") {
		await translateRecordString(caseRecord, "coordinatorRole", runtime);
		await translateRecordString(caseRecord, "coordinatorName", runtime);
		await translateRecordString(caseRecord, "hiraFollowupText", runtime);

		for (const person of records(translated.persons)) {
			await translateRecordString(person, "role", runtime);
			await translateRecordString(person, "name", runtime);
		}

		for (const account of records(translated.accounts)) {
			for (const fact of records(arrayField(account.facts))) {
				await translateRecordString(fact, "text", runtime);
			}
		}
	}

	for (const event of records(translated.timelineEvents)) {
		await translateRecordString(event, "text", runtime);

		if (options.artifact === "fullReport") {
			for (const deviation of records(arrayField(event.deviations))) {
				await translateRecordString(deviation, "expected", runtime);
				await translateRecordString(deviation, "actual", runtime);
			}
		}
	}

	for (const node of records(translated.causeNodes)) {
		await translateRecordString(node, "statement", runtime);

		if (options.artifact === "fullReport") {
			await translateRecordString(node, "question", runtime);
		}

		for (const action of records(arrayField(node.actions))) {
			await translateRecordString(action, "description", runtime);
			await translateRecordString(action, "ownerRole", runtime);
		}
	}

	return translated;
}

export async function translateIIStoredText(
	text: string,
	options: RequiredTranslationOptions,
): Promise<string> {
	if (text.trim().length === 0) {
		return text;
	}

	const prompt = buildIIStoredContentTranslationPrompt({
		sourceLocale: options.sourceLocale,
		targetLocale: options.targetLocale,
		text,
	});
	const req: LLMTextRequest = {
		options: {
			kind: KindEnum.Authoring,
			locale: options.targetLocale,
			promptPurpose: II_STORED_CONTENT_TRANSLATION_PROMPT_PURPOSE,
			requiresVision: false,
			tenantId: options.translationContext.tenantId,
			userId: options.translationContext.userId,
			workflowId: options.translationContext.workflowId,
		},
		prompt,
	};
	const result = await dispatch(
		req,
		options.translationContext.dispatchOptions,
	);

	if (!result.ok) {
		throw new IIStoredContentTranslationError(
			`II stored-content translation dispatch failed with ${result.code}.`,
			result,
		);
	}

	await recordCost(
		{
			calledAt: options.translationContext.now?.(),
			costUsd: "0",
			kind: KindEnum.Authoring,
			provider: result.response.provider ?? result.providerStep,
			tenantId: options.translationContext.tenantId,
			tokenInput: result.response.usage?.inputTokens ?? 0,
			tokenOutput: result.response.usage?.outputTokens ?? 0,
		},
		{ store: options.translationContext.costStore },
	);

	return result.response.text;
}

export function buildIIStoredContentTranslationPrompt(input: {
	readonly sourceLocale: Locale;
	readonly targetLocale: Locale;
	readonly text: string;
}): string {
	return [
		"Translate this Safety Secretary incident-investigation stored content.",
		`Source locale: ${input.sourceLocale}.`,
		`Target locale: ${input.targetLocale}.`,
		"Return only the translated text.",
		"Preserve names, dates, IDs, numbers, product names, and technical terms unless the target language has a standard safety-domain equivalent.",
		"Do not add commentary, explanations, markdown, or quotes.",
		"Text:",
		input.text,
	].join("\n");
}

async function translateRecordString(
	target: Record<string, SnapshotJson>,
	field: string,
	runtime: TranslationRuntime,
) {
	const value = stringOrNull(target[field]);

	if (value === null) {
		return;
	}

	const cached = runtime.cache.get(value);

	if (cached !== undefined) {
		target[field] = cached;
		return;
	}

	const translated = await translateIIStoredText(value, runtime.options);
	const draft = reviewableTranslationDraft(value, translated);
	runtime.cache.set(value, draft);
	target[field] = draft;
}

function reviewableTranslationDraft(
	source: string,
	translated: string,
): string {
	return `${source}\n${translated} (${II_STORED_CONTENT_TRANSLATION_REVIEW_MARKER})`;
}

function record(value: SnapshotJson): Record<string, SnapshotJson> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}

	return value;
}

function records(value: SnapshotJson[]): Array<Record<string, SnapshotJson>> {
	return value.map(record);
}

function arrayField(value: SnapshotJson | undefined): SnapshotJson[] {
	return Array.isArray(value) ? value : [];
}

function stringOrNull(value: SnapshotJson | undefined): string | null {
	return typeof value === "string" ? value : null;
}
