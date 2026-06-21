import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../../../lib/auth/session";
import {
	type CoachChatTurnProgressEvent,
	CoachDispatchError,
	CoachIncidentNotFoundError,
	CoachProviderError,
	runCoachChatTurn,
} from "../../../../../../../lib/incident/coach-chat";

export const runtime = "nodejs";

type CoachChatStreamRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type CoachChatStreamRequestBody = {
	message?: unknown;
	locale?: unknown;
};

type ProgressPayload = {
	readonly label: string;
	readonly detail?: string;
	readonly kind:
		| "admitted"
		| "agent"
		| "dispatch"
		| "operation"
		| "parsed"
		| "tool";
	readonly phase?: "start" | "end";
	readonly isError?: boolean;
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
	request: NextRequest,
	context: CoachChatStreamRouteContext,
): Promise<Response> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const body = ((await request.json().catch(() => ({}))) ??
		{}) as CoachChatStreamRequestBody;
	const message = stringValue(body.message);

	if (!message) {
		return NextResponse.json({ code: "MESSAGE_REQUIRED" }, { status: 400 });
	}

	const encoder = new TextEncoder();
	const abortController = new AbortController();
	let closed = false;
	const abortStream = () => {
		if (!abortController.signal.aborted) {
			abortController.abort();
		}
	};

	if (request.signal.aborted) {
		abortStream();
	} else {
		request.signal.addEventListener("abort", abortStream, { once: true });
	}

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const write = (event: string, payload: unknown): void => {
				if (closed || abortController.signal.aborted) {
					return;
				}

				try {
					controller.enqueue(
						encoder.encode(
							`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`,
						),
					);
				} catch {
					closed = true;
					abortStream();
				}
			};
			const close = (): void => {
				request.signal.removeEventListener("abort", abortStream);

				if (closed) {
					return;
				}

				closed = true;

				try {
					controller.close();
				} catch {
					// The response may already have been cancelled by the client.
				}
			};

			void (async () => {
				try {
					write("progress", {
						kind: "agent",
						label: "Preparing the incident coach",
						phase: "start",
					} satisfies ProgressPayload);

					const result = await runCoachChatTurn({
						incidentId: id,
						locale: stringValue(body.locale) || "en",
						message,
						onProgress: (event) => {
							const payload = progressPayloadFor(event);
							if (payload) {
								write("progress", payload);
							}
						},
						signal: abortController.signal,
						tenantId: session.tenantId,
						userId: session.userId,
					});

					if (abortController.signal.aborted) {
						return;
					}

					if (!result) {
						write("error", { code: "INCIDENT_NOT_FOUND" });
						return;
					}

					write("final", result);
				} catch (error) {
					if (abortController.signal.aborted) {
						return;
					}

					write("error", { code: codeForError(error) });
				} finally {
					close();
				}
			})();
		},
		cancel() {
			closed = true;
			request.signal.removeEventListener("abort", abortStream);
			abortStream();
		},
	});

	return new Response(stream, {
		headers: {
			"cache-control": "no-cache, no-transform",
			connection: "keep-alive",
			"content-type": "text/event-stream; charset=utf-8",
			"x-accel-buffering": "no",
		},
	});
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

function progressPayloadFor(
	event: CoachChatTurnProgressEvent,
): ProgressPayload | null {
	if (event.type === "dispatch_started") {
		return {
			kind: "dispatch",
			label: "Contacting the language model",
			phase: "start",
		};
	}

	if (event.type === "assistant_parsed") {
		return {
			detail: `${event.operationCount} proposed change${
				event.operationCount === 1 ? "" : "s"
			}`,
			kind: "parsed",
			label: "Prepared the coach reply",
			phase: "end",
		};
	}

	const flueEvent = event.event;

	if (flueEvent.type === "admitted") {
		return {
			detail: flueEvent.submissionId,
			kind: "admitted",
			label: "Connected to the durable case agent",
			phase: "start",
		};
	}

	if (flueEvent.type !== "activity") {
		return null;
	}

	if (flueEvent.toolName) {
		return {
			detail: readableName(flueEvent.toolName),
			isError: flueEvent.isError,
			kind: "tool",
			label: flueEvent.phase === "end" ? "Tool finished" : "Using tool",
			phase: flueEvent.phase,
		};
	}

	if (flueEvent.operationKind) {
		return {
			detail: readableName(flueEvent.operationKind),
			isError: flueEvent.isError,
			kind: "operation",
			label:
				flueEvent.phase === "end"
					? "Agent operation finished"
					: "Agent operation started",
			phase: flueEvent.phase,
		};
	}

	switch (flueEvent.eventType) {
		case "agent_start":
			return { kind: "agent", label: "Agent started", phase: "start" };
		case "agent_end":
			return { kind: "agent", label: "Agent finished", phase: "end" };
		case "turn_start":
			return {
				kind: "agent",
				label: "Thinking through the case",
				phase: "start",
			};
		case "turn":
			return {
				isError: flueEvent.isError,
				kind: "agent",
				label: "Finished reasoning turn",
				phase: "end",
			};
		case "compaction_start":
			return { kind: "agent", label: "Compacting case memory", phase: "start" };
		case "compaction":
			return {
				isError: flueEvent.isError,
				kind: "agent",
				label: "Finished compacting case memory",
				phase: "end",
			};
		default:
			return null;
	}
}

function readableName(value: string): string {
	return value.replaceAll("_", " ");
}

function codeForError(error: unknown): string {
	if (error instanceof CoachDispatchError) {
		return error.result.code.toUpperCase();
	}

	if (error instanceof CoachProviderError) {
		return "PROVIDER_FAILED";
	}

	if (error instanceof CoachIncidentNotFoundError) {
		return "INCIDENT_NOT_FOUND";
	}

	return "COACH_FAILED";
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
