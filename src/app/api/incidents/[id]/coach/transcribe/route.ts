import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../../../lib/auth/cookies";
import { verifyCsrfRequest } from "../../../../../../lib/auth/csrf";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../../lib/auth/session";
import {
	CoachTranscribeMonthlyCapError,
	CoachTranscribeNoProviderKeyError,
	CoachTranscribeProviderError,
	type TranscribeCoachAudioInput,
	transcribeCoachAudio,
} from "../../../../../../lib/incident/coach-transcribe";

export const runtime = "nodejs";

type CoachTranscribeRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type CoachTranscribeRouteOptions = {
	readonly sessionValidator?: SessionValidator;
	readonly transcribe?: (
		input: TranscribeCoachAudioInput,
	) => Promise<{ text: string }>;
};

type SessionValidator = (
	cookieValue: string | null | undefined,
) => Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null>;

type UploadedAudio = {
	readonly name: string;
	readonly size: number;
	readonly type: string;
	arrayBuffer(): Promise<ArrayBuffer>;
};

// gpt-4o-transcribe accepts the browser MediaRecorder formats we ship from the
// client (webm/ogg/mp4/m4a) plus wav. Cap ~20MB to bound a single push-to-talk
// clip; short clips are far smaller.
const maxAudioBytes = 20 * 1024 * 1024;
const allowedAudioTypes = new Set([
	"audio/webm",
	"audio/ogg",
	"audio/mp4",
	"audio/x-m4a",
	"audio/m4a",
	"audio/mpeg",
	"audio/wav",
	"audio/x-wav",
	"audio/wave",
]);

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
	request: NextRequest,
	context: CoachTranscribeRouteContext,
): Promise<NextResponse> {
	return handleCoachTranscribe(request, context);
}

export async function handleCoachTranscribe(
	request: NextRequest,
	context: CoachTranscribeRouteContext,
	options: CoachTranscribeRouteOptions = {},
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request, options.sessionValidator);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	// CSRF is enforced by the proxy for state-changing methods; a multipart POST
	// still carries the double-submit header from the client.
	if (!verifyCsrfRequest(request.headers, session.id)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	if (!isMultipartRequest(request)) {
		return NextResponse.json(
			{ code: "UNSUPPORTED_CONTENT_TYPE" },
			{ status: 415 },
		);
	}

	const formData = await request.formData().catch(() => null);
	const audio = uploadedAudioFromFormValue(formData?.get("audio"));

	if (!audio) {
		return NextResponse.json({ code: "AUDIO_REQUIRED" }, { status: 400 });
	}

	// MediaRecorder reports its type with codec parameters (e.g.
	// "audio/webm;codecs=opus" on Chrome/Firefox, "audio/mp4;codecs=..." on
	// Safari). Match on the MIME essence only so a real browser clip is not
	// rejected as UNSUPPORTED_CONTENT_TYPE before it ever reaches the provider.
	const mimeType = mimeEssence(audio.type);

	if (!allowedAudioTypes.has(mimeType)) {
		return NextResponse.json(
			{ code: "UNSUPPORTED_CONTENT_TYPE" },
			{ status: 415 },
		);
	}

	if (audio.size > maxAudioBytes) {
		return NextResponse.json({ code: "AUDIO_TOO_LARGE" }, { status: 413 });
	}

	const buffer = Buffer.from(await audio.arrayBuffer());

	if (buffer.byteLength === 0) {
		return NextResponse.json({ code: "AUDIO_REQUIRED" }, { status: 400 });
	}

	if (buffer.byteLength > maxAudioBytes) {
		return NextResponse.json({ code: "AUDIO_TOO_LARGE" }, { status: 413 });
	}

	const localeValue = stringValue(formData?.get("locale")) || "en";

	try {
		const result = await (options.transcribe ?? transcribeCoachAudio)({
			audio: buffer,
			filename: audio.name || "audio.webm",
			incidentId: id,
			locale: localeValue,
			mimeType,
			signal: request.signal,
			tenantId: session.tenantId,
			userId: session.userId,
		});

		return NextResponse.json({ text: result.text });
	} catch (error) {
		if (request.signal.aborted || isAbortError(error)) {
			return new NextResponse(null, { status: 499 });
		}

		if (error instanceof CoachTranscribeNoProviderKeyError) {
			return NextResponse.json({ code: "NO_PROVIDER_KEY" }, { status: 503 });
		}

		if (error instanceof CoachTranscribeMonthlyCapError) {
			return NextResponse.json(
				{ code: "MONTHLY_CAP_EXCEEDED" },
				{ status: 503 },
			);
		}

		if (error instanceof CoachTranscribeProviderError) {
			console.warn("[ii-coach-transcribe] provider failed:", {
				audioBytes: buffer.byteLength,
				message: error.message,
				mimeType,
				status: error.status ?? null,
			});
			if (error.status === 400) {
				return NextResponse.json({ code: "AUDIO_UNREADABLE" }, { status: 422 });
			}

			return NextResponse.json({ code: "PROVIDER_FAILED" }, { status: 502 });
		}

		throw error;
	}
}

async function resolveSession(
	request: NextRequest,
	sessionValidator: SessionValidator = validateSession,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
	return sessionValidator(readSessionCookie(request.cookies));
}

function isMultipartRequest(request: Request): boolean {
	return (request.headers.get("content-type") ?? "")
		.toLowerCase()
		.includes("multipart/form-data");
}

function uploadedAudioFromFormValue(
	value: FormDataEntryValue | null | undefined,
): UploadedAudio | null {
	if (
		typeof value === "object" &&
		value !== null &&
		"arrayBuffer" in value &&
		"name" in value &&
		"size" in value &&
		"type" in value
	) {
		return value as UploadedAudio;
	}

	return null;
}

function stringValue(value: FormDataEntryValue | null | undefined): string {
	return typeof value === "string" ? value.trim() : "";
}

// Drops codec/charset parameters and normalises case, e.g.
// "audio/webm;codecs=opus" -> "audio/webm".
function mimeEssence(value: string | null | undefined): string {
	return (value ?? "").split(";", 1)[0].trim().toLowerCase();
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException
		? error.name === "AbortError"
		: error instanceof Error && error.name === "AbortError";
}
