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

// The token is server-minted, session-bound, and re-issued by the proxy, so the
// client only reads it (preferring the __Host- carrier) and never mints.
function ensureCsrfToken(name: string): string {
	const token = readCookie("__Host-ssfw_csrf") || readCookie(name);

	if (!token) {
		throw new Error("CSRF_COOKIE_MISSING");
	}

	return decodeURIComponent(token);
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
