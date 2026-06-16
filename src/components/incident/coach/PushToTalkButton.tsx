"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
import type { CoachCopy } from "./copy";

type PushToTalkButtonProps = {
	readonly incidentId: string;
	readonly copy: CoachCopy;
	readonly disabled?: boolean;
	readonly onTranscript: (text: string) => void;
};

type RecorderState = "idle" | "recording" | "transcribing";

// MediaRecorder MIME preference, most broadly accepted by gpt-4o-transcribe
// first. Chrome/Firefox produce webm/opus; Safari produces mp4. We pick the
// first the browser actually supports.
const preferredMimeTypes = [
	"audio/webm",
	"audio/ogg",
	"audio/mp4",
];

const filenameByMime: Record<string, string> = {
	"audio/webm": "speech.webm",
	"audio/ogg": "speech.ogg",
	"audio/mp4": "speech.mp4",
};

export default function PushToTalkButton({
	incidentId,
	copy,
	disabled,
	onTranscript,
}: PushToTalkButtonProps) {
	const [supported, setSupported] = useState(true);
	const [state, setState] = useState<RecorderState>("idle");
	const [hint, setHint] = useState<string | null>(null);

	const recorderRef = useRef<MediaRecorder | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const mimeRef = useRef<string>("audio/webm");
	// Guards against a pointerleave firing after pointerup already stopped us.
	const activeRef = useRef(false);

	useEffect(() => {
		const ok =
			typeof window !== "undefined" &&
			typeof window.MediaRecorder !== "undefined" &&
			Boolean(navigator.mediaDevices?.getUserMedia);
		setSupported(ok);
	}, []);

	useEffect(() => {
		return () => {
			stopTracks(streamRef.current);
			streamRef.current = null;
		};
	}, []);

	const transcribe = useCallback(
		async (blob: Blob) => {
			setState("transcribing");
			setHint(null);

			try {
				const formData = new FormData();
				formData.set(
					"audio",
					blob,
					filenameByMime[mimeRef.current] ?? "speech.webm",
				);

				const response = await fetch(
					`/api/incidents/${encodeURIComponent(incidentId)}/coach/transcribe`,
					{
						body: formData,
						credentials: "same-origin",
						headers: { "x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME) },
						method: "POST",
					},
				);
				const body = (await response.json().catch(() => ({}))) as {
					text?: string;
					code?: string;
				};

				if (!response.ok) {
					setHint(transcribeErrorMessage(body.code, copy));
					return;
				}

				const text = (body.text ?? "").trim();
				if (text) {
					onTranscript(text);
				} else {
					setHint(copy.mic.didNotCatch);
				}
			} catch {
				setHint(copy.mic.couldNotTranscribe);
			} finally {
				setState("idle");
			}
		},
		[copy, incidentId, onTranscript],
	);

	const start = useCallback(async () => {
		if (!supported || disabled || activeRef.current || state !== "idle") {
			return;
		}

		activeRef.current = true;
		setHint(null);

		let stream: MediaStream;

		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			activeRef.current = false;
			setHint(copy.mic.micBlocked);
			return;
		}

		// The user may have released before permission resolved.
		if (!activeRef.current) {
			stopTracks(stream);
			return;
		}

		streamRef.current = stream;
		const mimeType = chooseMimeType();
		mimeRef.current = mimeType;
		chunksRef.current = [];

		const recorder = mimeType
			? new MediaRecorder(stream, { mimeType })
			: new MediaRecorder(stream);
		recorderRef.current = recorder;

		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				chunksRef.current.push(event.data);
			}
		};

		recorder.onstop = () => {
			stopTracks(streamRef.current);
			streamRef.current = null;
			recorderRef.current = null;

			const chunks = chunksRef.current;
			chunksRef.current = [];

			if (chunks.length === 0) {
				return;
			}

			const blob = new Blob(chunks, {
				type: recorder.mimeType || mimeRef.current,
			});
			void transcribe(blob);
		};

		recorder.start();
		setState("recording");
	}, [copy, disabled, state, supported, transcribe]);

	const stop = useCallback(() => {
		if (!activeRef.current) {
			return;
		}

		activeRef.current = false;

		const recorder = recorderRef.current;
		if (recorder && recorder.state !== "inactive") {
			recorder.stop();
		} else {
			// getUserMedia was still pending — release whatever opened.
			stopTracks(streamRef.current);
			streamRef.current = null;
			setState("idle");
		}
	}, []);

	if (!supported) {
		return null;
	}

	const recording = state === "recording";
	const transcribing = state === "transcribing";
	const isDisabled = disabled || transcribing;

	return (
		<div className="flex flex-col items-center gap-1">
			<button
				aria-label={recording ? copy.mic.recordingRelease : copy.mic.holdToTalk}
				aria-pressed={recording}
				className={`inline-flex min-h-[2.75rem] min-w-[2.75rem] touch-none select-none items-center justify-center rounded-md border text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
					recording
						? "border-[var(--color-danger)] bg-[var(--color-danger)] text-white"
						: "border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
				}`}
				disabled={isDisabled}
				onContextMenu={(event) => event.preventDefault()}
				onPointerDown={(event) => {
					event.preventDefault();
					void start();
				}}
				onPointerLeave={() => stop()}
				onPointerUp={() => stop()}
				title={recording ? copy.mic.releaseToTranscribe : copy.mic.holdToTalk}
				type="button"
			>
				{transcribing ? "…" : <MicGlyph />}
			</button>
			{recording ? (
				<span className="flex items-center gap-1 text-xs text-[var(--color-danger)]">
					<span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-danger)]" />
					{copy.mic.listening}
				</span>
			) : null}
			{transcribing ? (
				<span className="text-xs text-[var(--color-muted)]">
					{copy.mic.transcribing}
				</span>
			) : null}
			{hint ? (
				<span className="max-w-[12rem] text-center text-xs text-[var(--color-danger)]">
					{hint}
				</span>
			) : null}
		</div>
	);
}

function MicGlyph() {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="18"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
			width="18"
		>
			<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
			<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
			<line x1="12" x2="12" y1="19" y2="23" />
			<line x1="8" x2="16" y1="23" y2="23" />
		</svg>
	);
}

function chooseMimeType(): string {
	if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
		return "";
	}

	for (const candidate of preferredMimeTypes) {
		if (MediaRecorder.isTypeSupported(candidate)) {
			return candidate;
		}
	}

	return "";
}

function stopTracks(stream: MediaStream | null): void {
	if (!stream) {
		return;
	}

	for (const track of stream.getTracks()) {
		track.stop();
	}
}

function transcribeErrorMessage(
	code: string | undefined,
	copy: CoachCopy,
): string {
	const map: Record<string, string> = {
		AUDIO_REQUIRED: copy.mic.errAudioRequired,
		AUDIO_TOO_LARGE: copy.mic.errAudioTooLarge,
		AUDIO_UNREADABLE: copy.mic.didNotCatch,
		MONTHLY_CAP_EXCEEDED: copy.mic.errMonthlyCap,
		NO_PROVIDER_KEY: copy.mic.errNoProviderKey,
		PROVIDER_FAILED: copy.mic.errProviderFailed,
		UNSUPPORTED_CONTENT_TYPE: copy.mic.errUnsupportedType,
	};

	return map[code ?? ""] ?? copy.mic.errGeneric;
}
