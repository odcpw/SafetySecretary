"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentStructuredOperation } from "../../../lib/agent/types";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
import type {
	CoachChatMessage,
	CoachOperationDecision,
} from "../../../lib/incident/coach-chat";
import type { IncidentRecord } from "../coach/types";

export type CanvasPendingOperation = {
	readonly message: CoachChatMessage;
	readonly operation: AgentStructuredOperation;
};

type CoachStreamProgress = {
	readonly label: string;
	readonly detail?: string;
	readonly kind?: string;
	readonly phase?: "start" | "end";
	readonly isError?: boolean;
};

export function useIncidentCanvasCoach({
	incidentId,
	onRecordRefresh,
	replyLocale,
}: {
	incidentId: string;
	onRecordRefresh: (record: IncidentRecord) => void;
	replyLocale: string;
}) {
	const [messages, setMessages] = useState<CoachChatMessage[]>([]);
	const [sending, setSending] = useState(false);
	const [loaded, setLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [busyOperationIds, setBusyOperationIds] = useState<Set<string>>(
		new Set(),
	);
	const [dismissingOperationIds, setDismissingOperationIds] = useState<
		Set<string>
	>(new Set());
	const [activity, setActivity] = useState<string | null>(null);
	const [bulkApplying, setBulkApplying] = useState(false);
	const recordMapRef = useRef<Record<string, string>>({});
	const sendingRef = useRef(false);
	const sendAbortRef = useRef<AbortController | null>(null);
	const busyOperationIdsRef = useRef<ReadonlySet<string>>(new Set());
	const bulkApplyingRef = useRef(false);
	const mountedRef = useRef(true);

	useEffect(() => {
		sendingRef.current = sending;
	}, [sending]);

	useEffect(() => {
		busyOperationIdsRef.current = busyOperationIds;
	}, [busyOperationIds]);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			sendAbortRef.current?.abort();
			sendAbortRef.current = null;
		};
	}, []);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			try {
				const response = await fetch(
					`/api/incidents/${encodeURIComponent(incidentId)}/coach/chat`,
					{ credentials: "same-origin" },
				);
				if (!response.ok) {
					throw new Error(`CHAT_LOAD_FAILED_${response.status}`);
				}
				const body = (await response.json()) as {
					messages: CoachChatMessage[];
				};
				if (!cancelled) {
					setMessages(body.messages);
					recordMapRef.current = recordMapFromMessages(body.messages);
				}
			} catch {
				if (!cancelled) {
					setError("The coach conversation could not be loaded.");
				}
			} finally {
				if (!cancelled) {
					setLoaded(true);
				}
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, [incidentId]);

	const refreshRecord = useCallback(async () => {
		const response = await fetch(
			`/api/incidents/${encodeURIComponent(incidentId)}/record`,
			{ credentials: "same-origin" },
		);
		if (!response.ok) {
			throw new Error(`Incident refresh failed: ${response.status}`);
		}
		const body = (await response.json()) as { record?: IncidentRecord };
		if (!body.record) {
			throw new Error("Incident refresh returned no record.");
		}
		onRecordRefresh(body.record);
	}, [incidentId, onRecordRefresh]);

	function beginSending(): boolean {
		if (sendingRef.current) {
			return false;
		}
		sendingRef.current = true;
		setSending(true);
		return true;
	}

	function finishSending() {
		sendingRef.current = false;
		setSending(false);
	}

	function claimBusyOperation(operationId: string): boolean {
		if (busyOperationIdsRef.current.has(operationId)) {
			return false;
		}
		const next = new Set(busyOperationIdsRef.current);
		next.add(operationId);
		busyOperationIdsRef.current = next;
		setBusyOperationIds(next);
		return true;
	}

	function releaseBusyOperation(operationId: string) {
		const next = new Set(busyOperationIdsRef.current);
		next.delete(operationId);
		busyOperationIdsRef.current = next;
		setBusyOperationIds(next);
	}

	async function submitMessage(rawMessage: string): Promise<boolean> {
		const message = rawMessage.trim();
		if (!message || !beginSending()) {
			return false;
		}

		setError(null);
		setActivity("Thinking…");
		const controller = new AbortController();
		sendAbortRef.current = controller;
		const optimistic: CoachChatMessage = {
			content: message,
			createdAt: new Date().toISOString(),
			id: `optimistic-${Date.now()}`,
			operationDecisions: {},
			operations: [],
			role: "user",
		};
		setMessages((current) => [...current, optimistic]);

		try {
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(incidentId)}/coach/chat/stream`,
				{
					body: JSON.stringify({ locale: replyLocale, message }),
					credentials: "same-origin",
					headers: {
						"content-type": "application/json",
						"x-safetysecretary-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
					},
					method: "POST",
					signal: controller.signal,
				},
			);
			if (!mountedRef.current || controller.signal.aborted) {
				return false;
			}

			const body = await readCoachStreamTurn(response, (progress) => {
				if (mountedRef.current && !controller.signal.aborted) {
					setActivity(progress.detail || progress.label);
				}
			});
			setMessages((current) => [
				...current.filter((candidate) => candidate.id !== optimistic.id),
				body.userMessage,
				body.assistantMessage,
			]);
			return true;
		} catch (caught) {
			if (!mountedRef.current || isAbortError(caught)) {
				return false;
			}
			setMessages((current) =>
				current.filter((candidate) => candidate.id !== optimistic.id),
			);
			setError(userSafeError(caught));
			return false;
		} finally {
			if (sendAbortRef.current === controller) {
				sendAbortRef.current = null;
			}
			if (mountedRef.current) {
				setActivity(null);
				finishSending();
			}
		}
	}

	async function decide(
		message: CoachChatMessage,
		operation: AgentStructuredOperation,
		action: "apply" | "dismiss",
	): Promise<boolean> {
		if (!claimBusyOperation(operation.id)) {
			return false;
		}
		setError(null);

		try {
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(incidentId)}/coach/chat/apply`,
				{
					body: JSON.stringify({
						action,
						messageId: message.id,
						operationId: operation.id,
						operationRecordMap: recordMapRef.current,
					}),
					credentials: "same-origin",
					headers: {
						"content-type": "application/json",
						"x-safetysecretary-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
					},
					method: "POST",
				},
			);
			const body = (await response.json().catch(() => ({}))) as {
				applied?: { recordId?: string | null };
				code?: string;
			};
			if (!mountedRef.current) {
				return false;
			}
			if (!response.ok) {
				throw new Error(body.code ?? `APPLY_FAILED_${response.status}`);
			}

			if (action === "dismiss") {
				setDismissingOperationIds((current) =>
					new Set(current).add(operation.id),
				);
				await waitForDismissFade();
				if (!mountedRef.current) {
					return false;
				}
			}

			const decision: CoachOperationDecision =
				action === "apply"
					? { recordId: body.applied?.recordId ?? null, status: "applied" }
					: { recordId: null, status: "dismissed" };
			setMessages((current) =>
				current.map((candidate) =>
					candidate.id === message.id
						? {
								...candidate,
								operationDecisions: {
									...candidate.operationDecisions,
									[operation.id]: decision,
								},
							}
						: candidate,
				),
			);

			if (action === "apply" && body.applied?.recordId) {
				recordMapRef.current = {
					...recordMapRef.current,
					[operation.id]: body.applied.recordId,
				};
			}
			if (action === "apply") {
				await refreshRecord();
			}
			return true;
		} catch (caught) {
			if (mountedRef.current) {
				setError(userSafeError(caught));
			}
			return false;
		} finally {
			if (mountedRef.current) {
				setDismissingOperationIds((current) => {
					const next = new Set(current);
					next.delete(operation.id);
					return next;
				});
				releaseBusyOperation(operation.id);
			}
		}
	}

	const pendingOperations = messages.flatMap((message) =>
		message.operations.flatMap((operation) =>
			message.operationDecisions[operation.id] ? [] : [{ message, operation }],
		),
	);

	async function applyAllPending() {
		if (bulkApplyingRef.current) {
			return;
		}
		bulkApplyingRef.current = true;
		setBulkApplying(true);

		try {
			for (const { message, operation } of pendingOperations) {
				// Sequential on purpose: later operations may reference earlier ones.
				// eslint-disable-next-line no-await-in-loop
				const accepted = await decide(message, operation, "apply");
				if (!accepted) {
					break;
				}
			}
		} finally {
			bulkApplyingRef.current = false;
			if (mountedRef.current) {
				setBulkApplying(false);
			}
		}
	}

	return {
		activity,
		applyAllPending,
		bulkApplying,
		busyOperationIds,
		decide,
		dismissingOperationIds,
		error,
		loaded,
		messages,
		pendingOperations,
		sending,
		submitMessage,
	};
}

export type IncidentCanvasCoach = ReturnType<typeof useIncidentCanvasCoach>;

async function readCoachStreamTurn(
	response: Response,
	onProgress: (progress: CoachStreamProgress) => void,
): Promise<{
	userMessage: CoachChatMessage;
	assistantMessage: CoachChatMessage;
}> {
	if (!response.ok) {
		const body = (await response.json().catch(() => ({}))) as { code?: string };
		throw new Error(body.code ?? `COACH_FAILED_${response.status}`);
	}

	const contentType = response.headers.get("content-type") ?? "";
	if (!response.body || !contentType.includes("text/event-stream")) {
		const body = (await response.json().catch(() => ({}))) as {
			userMessage?: CoachChatMessage;
			assistantMessage?: CoachChatMessage;
			code?: string;
		};
		if (!body.userMessage || !body.assistantMessage) {
			throw new Error(body.code ?? "COACH_FAILED");
		}
		return {
			assistantMessage: body.assistantMessage,
			userMessage: body.userMessage,
		};
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let final: {
		userMessage: CoachChatMessage;
		assistantMessage: CoachChatMessage;
	} | null = null;

	try {
		while (true) {
			const { done, value } = await reader.read();
			buffer += decoder.decode(value, { stream: !done });
			let boundary = buffer.indexOf("\n\n");
			while (boundary !== -1) {
				const block = buffer.slice(0, boundary);
				buffer = buffer.slice(boundary + 2);
				const event = parseSseBlock(block);
				if (event?.name === "progress") {
					const progress = progressPayload(event.data);
					if (progress) {
						onProgress(progress);
					}
				}
				if (event?.name === "final") {
					final = finalPayload(event.data);
				}
				if (event?.name === "error") {
					const data = event.data as { code?: unknown } | null;
					throw new Error(
						typeof data?.code === "string" ? data.code : "COACH_FAILED",
					);
				}
				boundary = buffer.indexOf("\n\n");
			}
			if (done) {
				break;
			}
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}

	if (!final) {
		throw new Error("COACH_FAILED");
	}
	return final;
}

function parseSseBlock(block: string): { name: string; data: unknown } | null {
	let name = "message";
	const dataLines: string[] = [];
	for (const rawLine of block.split(/\r?\n/)) {
		if (!rawLine || rawLine.startsWith(":")) {
			continue;
		}
		if (rawLine.startsWith("event:")) {
			name = rawLine.slice("event:".length).trim();
			continue;
		}
		if (rawLine.startsWith("data:")) {
			dataLines.push(rawLine.slice("data:".length).trimStart());
		}
	}
	if (dataLines.length === 0) {
		return null;
	}
	try {
		return { data: JSON.parse(dataLines.join("\n")), name };
	} catch {
		return null;
	}
}

function progressPayload(value: unknown): CoachStreamProgress | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const record = value as Record<string, unknown>;
	const label = typeof record.label === "string" ? record.label : "";
	if (!label) {
		return null;
	}
	return {
		detail: typeof record.detail === "string" ? record.detail : undefined,
		isError: typeof record.isError === "boolean" ? record.isError : undefined,
		kind: typeof record.kind === "string" ? record.kind : undefined,
		label,
		phase:
			record.phase === "start" || record.phase === "end"
				? record.phase
				: undefined,
	};
}

function finalPayload(value: unknown): {
	userMessage: CoachChatMessage;
	assistantMessage: CoachChatMessage;
} | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const record = value as {
		assistantMessage?: CoachChatMessage;
		userMessage?: CoachChatMessage;
	};
	return record.userMessage && record.assistantMessage
		? {
				assistantMessage: record.assistantMessage,
				userMessage: record.userMessage,
			}
		: null;
}

function recordMapFromMessages(
	messages: readonly CoachChatMessage[],
): Record<string, string> {
	const map: Record<string, string> = {};
	for (const message of messages) {
		for (const [operationId, decision] of Object.entries(
			message.operationDecisions,
		)) {
			if (decision.status === "applied" && decision.recordId) {
				map[operationId] = decision.recordId;
			}
		}
	}
	return map;
}

function userSafeError(caught: unknown): string {
	if (!(caught instanceof Error)) {
		return "The coach could not complete that request.";
	}
	const messages: Record<string, string> = {
		ALREADY_DECIDED: "That proposal was already reviewed.",
		CAUSE_NODE_REQUIRED: "Choose or create a cause before adding this measure.",
		INVALID_FIELD_VALUE: "That value cannot be added to the record.",
		INVALID_OPERATION: "That proposal is no longer valid.",
		MONTHLY_CAP_EXCEEDED: "The monthly coach limit has been reached.",
		OPERATION_NOT_IN_MESSAGE: "That proposal is no longer available.",
		PERSON_ACCOUNT_REQUIRED: "Choose the person this fact came from.",
		PROVIDER_FAILED: "The coach is temporarily unavailable.",
		UNRESOLVED_OPERATION_REFERENCE:
			"Accept the linked proposal first, then try this one again.",
	};
	return messages[caught.message] ?? caught.message;
}

function waitForDismissFade(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, 180));
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException
		? error.name === "AbortError"
		: error instanceof Error && error.name === "AbortError";
}
