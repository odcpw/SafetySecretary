import {
	AgentErrorCategory,
	type AgentErrorCategory as Category,
} from "./types";

export class AgentRuntimeError extends Error {
	readonly category: Category;
	readonly userSafeMessage: string;

	constructor(
		category: Category,
		userSafeMessage: string,
		message = userSafeMessage,
	) {
		super(message);
		this.name = "AgentRuntimeError";
		this.category = category;
		this.userSafeMessage = userSafeMessage;
	}
}

export class AgentRunCancelledError extends Error {
	readonly userSafeMessage: string;

	constructor(message = "The agent run was cancelled.") {
		super(message);
		this.name = "AgentRunCancelledError";
		this.userSafeMessage = message;
	}
}

export function isAgentRuntimeError(
	error: unknown,
): error is AgentRuntimeError {
	return error instanceof AgentRuntimeError;
}

export function isAgentRunCancelledError(
	error: unknown,
): error is AgentRunCancelledError {
	return error instanceof AgentRunCancelledError;
}

export function categoryForUnknownError(error: unknown): Category {
	if (isAgentRuntimeError(error)) {
		return error.category;
	}

	return AgentErrorCategory.RuntimeInternal;
}

export function userSafeMessageForError(error: unknown): string {
	if (isAgentRuntimeError(error)) {
		return error.userSafeMessage;
	}

	if (error instanceof AgentRunCancelledError) {
		return error.userSafeMessage;
	}

	return "The assistant could not complete this run. Manual editing is still available.";
}
