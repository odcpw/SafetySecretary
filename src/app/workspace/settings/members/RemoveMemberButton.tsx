"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RemoveMemberButtonProps = {
	errorLabel: string;
	label: string;
	memberId: string;
	pendingLabel: string;
};

const csrfCookieName = "ssfw_csrf";
const csrfHeaderName = "x-ssfw-csrf";

export function RemoveMemberButton({
	errorLabel,
	label,
	memberId,
	pendingLabel,
}: RemoveMemberButtonProps) {
	const router = useRouter();
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);

	async function handleRemove() {
		setError("");
		setPending(true);

		try {
			const csrfToken = ensureCsrfToken(csrfCookieName);
			const response = await fetch(
				`/api/auth/members/${encodeURIComponent(memberId)}`,
				{
					credentials: "same-origin",
					headers: { [csrfHeaderName]: csrfToken },
					method: "DELETE",
				},
			);

			if (response.ok) {
				router.refresh();
				return;
			}

			if (response.status === 401) {
				window.location.assign("/signin");
				return;
			}

			setError(errorLabel);
		} catch {
			setError(errorLabel);
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="grid justify-items-end gap-1">
			<button
				className="inline-flex min-h-9 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] disabled:cursor-wait disabled:opacity-70"
				disabled={pending}
				onClick={handleRemove}
				type="button"
			>
				{pending ? pendingLabel : label}
			</button>
			{error ? (
				<p
					className="m-0 text-right text-xs text-[var(--color-danger)]"
					role="alert"
				>
					{error}
				</p>
			) : null}
		</div>
	);
}

function ensureCsrfToken(name: string): string {
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
