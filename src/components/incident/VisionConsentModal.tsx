"use client";

import { useState } from "react";
import { CSRF_COOKIE_NAME } from "../../lib/auth/cookies";
import type { WorkflowVisionConsent } from "../../lib/llm/consent";
import { LLMProviderErrorCode } from "../../lib/llm/errors";

export type VisionConsentModalLabels = {
	alwaysButton: string;
	askButton: string;
	cancelButton: string;
	companyUnavailable: string;
	description: string;
	error: string;
	neverButton: string;
	pending: string;
	title: string;
	workflowUnavailable: string;
};

type VisionConsentModalProps = {
	companyVisionEnabled: boolean;
	incidentId: string;
	initialConsent: WorkflowVisionConsent;
	labels: VisionConsentModalLabels;
	onCancel?: () => void;
	onConsent?: (consent: WorkflowVisionConsent) => void;
	open: boolean;
	requiresVision: boolean;
};

export function VisionConsentModal({
	companyVisionEnabled,
	incidentId,
	initialConsent,
	labels,
	onCancel,
	onConsent,
	open,
	requiresVision,
}: VisionConsentModalProps) {
	const [error, setError] = useState("");
	const [pending, setPending] = useState<WorkflowVisionConsent | null>(null);

	if (!open || !requiresVision || !companyVisionEnabled) {
		return null;
	}

	if (initialConsent !== "ASK") {
		return null;
	}

	async function choose(visionConsent: WorkflowVisionConsent) {
		setError("");
		setPending(visionConsent);

		try {
			const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(incidentId)}/vision-consent`,
				{
					body: JSON.stringify({ visionConsent }),
					credentials: "same-origin",
					headers: {
						"content-type": "application/json",
						"x-ssfw-csrf": csrfToken,
					},
					method: "POST",
				},
			);
			const body = (await response.json().catch(() => ({}))) as {
				code?: string;
			};

			if (!response.ok) {
				setError(
					body.code === LLMProviderErrorCode.VisionUnavailableCompany
						? labels.companyUnavailable
						: labels.error,
				);
				return;
			}

			if (body.code === LLMProviderErrorCode.VisionUnavailableWorkflow) {
				setError(labels.workflowUnavailable);
			}

			onConsent?.(visionConsent);
		} catch {
			setError(labels.error);
		} finally {
			setPending(null);
		}
	}

	return (
		<div
			aria-labelledby="vision-consent-title"
			className="fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_srgb,var(--color-bg)_78%,transparent)] p-4"
			role="dialog"
		>
			<section className="grid w-full max-w-lg gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-[var(--color-text)] shadow-xl">
				<header className="grid gap-2">
					<h2 className="m-0 text-lg font-semibold" id="vision-consent-title">
						{labels.title}
					</h2>
					<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
						{labels.description}
					</p>
				</header>
				<div className="grid gap-2">
					<button
						className={primaryButtonClassName}
						disabled={Boolean(pending)}
						onClick={() => choose("ASK")}
						type="button"
					>
						{pending === "ASK" ? labels.pending : labels.askButton}
					</button>
					<button
						className={secondaryButtonClassName}
						disabled={Boolean(pending)}
						onClick={() => choose("ALWAYS")}
						type="button"
					>
						{pending === "ALWAYS" ? labels.pending : labels.alwaysButton}
					</button>
					<button
						className={secondaryButtonClassName}
						disabled={Boolean(pending)}
						onClick={() => choose("NEVER")}
						type="button"
					>
						{pending === "NEVER" ? labels.pending : labels.neverButton}
					</button>
				</div>
				<div className="flex flex-wrap items-center justify-between gap-2">
					{error ? (
						<p className="m-0 text-sm text-[var(--color-danger)]" role="alert">
							{error}
						</p>
					) : (
						<span />
					)}
					<button
						className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2 text-sm font-medium text-[var(--color-text)]"
						disabled={Boolean(pending)}
						onClick={onCancel}
						type="button"
					>
						{labels.cancelButton}
					</button>
				</div>
			</section>
		</div>
	);
}

const primaryButtonClassName =
	"inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-bg)] disabled:cursor-wait disabled:opacity-70";
const secondaryButtonClassName =
	"inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2 text-sm font-medium text-[var(--color-text)] disabled:cursor-wait disabled:opacity-70";

export function ensureCsrfToken(name: string): string {
	const existingToken = readCookie(name);

	if (existingToken) {
		return decodeURIComponent(existingToken);
	}

	const token = createCsrfToken();
	writeCookie(name, token);

	const storedToken = readCookie(name);
	if (!storedToken) {
		throw new Error("CSRF_COOKIE_WRITE_FAILED");
	}

	return decodeURIComponent(storedToken);
}

function readCookie(name: string): string {
	const prefix = `${name}=`;
	return (
		document.cookie
			.split(";")
			.map((value) => value.trim())
			.find((value) => value.startsWith(prefix))
			?.slice(prefix.length) ?? ""
	);
}

function writeCookie(name: string, value: string): void {
	const attributes = [
		`${name}=${encodeURIComponent(value)}`,
		"Path=/",
		"SameSite=Lax",
	];

	if (window.location.protocol === "https:") {
		attributes.push("Secure");
	}

	// biome-ignore lint/suspicious/noDocumentCookie: the app proxy expects a double-submit CSRF cookie.
	document.cookie = attributes.join("; ");
}

function createCsrfToken(): string {
	if (window.crypto && typeof window.crypto.randomUUID === "function") {
		return window.crypto.randomUUID();
	}

	if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
		throw new Error("CSRF_UNAVAILABLE");
	}

	const bytes = Uint8Array.from({ length: 32 }, () => 0);
	window.crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}
