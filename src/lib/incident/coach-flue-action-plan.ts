import { AgentOperationKind } from "../agent/types";

export const FLUE_ACTION_PLAN_STOP_CLASSES = ["S", "T", "O", "P"] as const;
export const FLUE_ACTION_PLAN_PURPOSES = [
	"corrective",
	"preventive",
] as const;

export type FlueActionPlanStopClass =
	(typeof FLUE_ACTION_PLAN_STOP_CLASSES)[number];
export type FlueActionPlanPurpose = (typeof FLUE_ACTION_PLAN_PURPOSES)[number];

export type FlueActionPlanAction = {
	readonly title: string;
	readonly stopClass: FlueActionPlanStopClass;
	readonly purpose: FlueActionPlanPurpose;
	readonly linkedCauseNodeId?: string;
	readonly linkedCauseStatement?: string;
	readonly owner?: string;
	readonly dueDate?: string;
};

export type FlueActionPlanInput = {
	readonly actions: readonly FlueActionPlanAction[];
	readonly existingCauseIds?: readonly string[];
};

export type FlueActionPlanRawOperation =
	| {
			readonly kind: typeof AgentOperationKind.CauseNode;
			readonly ref: string;
			readonly payload: {
				readonly branchStatus: "OPEN";
				readonly label: string;
				readonly method: "cause-tree";
			};
	  }
	| {
			readonly kind: typeof AgentOperationKind.StopAction;
			readonly payload: {
				readonly dueDate?: string;
				readonly linkedCauseNodeId: string;
				readonly owner?: string;
				readonly purpose: FlueActionPlanPurpose;
				readonly stopClass: FlueActionPlanStopClass;
				readonly title: string;
			};
	  };

export type FlueActionPlanResult =
	| {
			readonly actionCount: number;
			readonly causeCount: number;
			readonly ok: true;
			readonly operations: readonly FlueActionPlanRawOperation[];
	  }
	| {
			readonly errors: readonly string[];
			readonly ok: false;
			readonly operations: readonly FlueActionPlanRawOperation[];
	  };

export function buildFlueActionPlanOperations(
	input: FlueActionPlanInput,
): FlueActionPlanResult {
	const errors: string[] = [];
	const operations: FlueActionPlanRawOperation[] = [];
	const existingCauseIds = new Set(
		(input.existingCauseIds ?? []).map((id) => id.trim()).filter(Boolean),
	);
	const generatedCauseRefs = new Map<string, string>();

	if (input.actions.length === 0) {
		return {
			errors: ["At least one agreed measure is required."],
			ok: false,
			operations,
		};
	}

	for (const [index, action] of input.actions.entries()) {
		const position = index + 1;
		const title = cleanText(action.title);
		const stopClass = action.stopClass;
		const purpose = action.purpose;
		const linkedCauseNodeId = cleanText(action.linkedCauseNodeId);
		const linkedCauseStatement = cleanText(action.linkedCauseStatement);
		const owner = cleanText(action.owner);
		const dueDate = cleanDate(action.dueDate);
		let linkedCauseReference = "";

		if (!title) {
			errors.push(`Action ${position} is missing a title.`);
		}

		if (!FLUE_ACTION_PLAN_STOP_CLASSES.includes(stopClass)) {
			errors.push(`Action ${position} has invalid stopClass.`);
		}

		if (!FLUE_ACTION_PLAN_PURPOSES.includes(purpose)) {
			errors.push(`Action ${position} has invalid purpose.`);
		}

		if (action.dueDate && !dueDate) {
			errors.push(`Action ${position} dueDate must be YYYY-MM-DD.`);
		}

		if (linkedCauseNodeId) {
			if (!existingCauseIds.has(linkedCauseNodeId)) {
				errors.push(
					`Action ${position} linkedCauseNodeId is not in the current incident cause list.`,
				);
			} else {
				linkedCauseReference = linkedCauseNodeId;
			}
		}

		if (!linkedCauseReference && linkedCauseStatement) {
			const normalizedStatement = linkedCauseStatement.toLowerCase();
			const existingRef = generatedCauseRefs.get(normalizedStatement);

			if (existingRef) {
				linkedCauseReference = existingRef;
			} else {
				linkedCauseReference = `action-cause-${position}`;
				generatedCauseRefs.set(normalizedStatement, linkedCauseReference);
				operations.push({
					kind: AgentOperationKind.CauseNode,
					ref: linkedCauseReference,
					payload: {
						branchStatus: "OPEN",
						label: linkedCauseStatement,
						method: "cause-tree",
					},
				});
			}
		}

		if (!linkedCauseReference) {
			errors.push(
				`Action ${position} must link to an existing cause id or include linkedCauseStatement.`,
			);
		}

		if (
			title &&
			FLUE_ACTION_PLAN_STOP_CLASSES.includes(stopClass) &&
			FLUE_ACTION_PLAN_PURPOSES.includes(purpose) &&
			linkedCauseReference &&
			(!action.dueDate || dueDate)
		) {
			operations.push({
				kind: AgentOperationKind.StopAction,
				payload: {
					...(dueDate ? { dueDate } : {}),
					linkedCauseNodeId: linkedCauseReference,
					...(owner ? { owner } : {}),
					purpose,
					stopClass,
					title,
				},
			});
		}
	}

	if (errors.length > 0) {
		return { errors, ok: false, operations };
	}

	return {
		actionCount: operations.filter(
			(operation) => operation.kind === AgentOperationKind.StopAction,
		).length,
		causeCount: operations.filter(
			(operation) => operation.kind === AgentOperationKind.CauseNode,
		).length,
		ok: true,
		operations,
	};
}

function cleanText(value: string | undefined): string {
	return value?.trim().replace(/\s+/g, " ") ?? "";
}

function cleanDate(value: string | undefined): string {
	const cleaned = cleanText(value);

	if (!cleaned) {
		return "";
	}

	return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : "";
}
