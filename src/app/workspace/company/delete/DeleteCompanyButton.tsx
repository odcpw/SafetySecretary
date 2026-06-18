"use client";

import { useState } from "react";
import { ensureCsrfToken } from "../../../../lib/auth/csrf-client";
import { CSRF_COOKIE_NAME } from "../../../../lib/auth/cookies";

type DeleteCompanyButtonProps = {
	confirmationLabel: string;
	confirmationValue: string;
	errorLabel: string;
	pendingLabel: string;
	submitLabel: string;
};

const csrfHeaderName = "x-ssfw-csrf";

export function DeleteCompanyButton({
	confirmationLabel,
	confirmationValue,
	errorLabel,
	pendingLabel,
	submitLabel,
}: DeleteCompanyButtonProps) {
	const [confirmation, setConfirmation] = useState("");
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);

	async function handleDelete() {
		setError("");

		if (confirmation.trim() !== confirmationValue) {
			setError(errorLabel);
			return;
		}

		setPending(true);

		try {
			const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
			const response = await fetch("/api/auth/company", {
				body: JSON.stringify({ confirmation }),
				credentials: "same-origin",
				headers: {
					"content-type": "application/json",
					[csrfHeaderName]: csrfToken,
				},
				method: "DELETE",
			});

			if (response.ok || response.status === 401) {
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
		<div className="grid gap-3">
			<label className="grid gap-1.5 text-sm">
				<span className="font-medium text-[var(--color-muted)]">
					{confirmationLabel}
				</span>
				<input
					className="min-h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors focus-visible:border-[var(--color-danger)] focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]"
					onChange={(event) => setConfirmation(event.target.value)}
					type="text"
					value={confirmation}
				/>
			</label>
			<button
				className="inline-flex min-h-10 w-fit items-center justify-center rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)] px-3 py-2 text-sm font-medium text-[var(--color-bg)] disabled:cursor-wait disabled:opacity-70"
				disabled={pending}
				onClick={handleDelete}
				type="button"
			>
				{pending ? pendingLabel : submitLabel}
			</button>
			{error ? (
				<p className="m-0 text-sm text-[var(--color-danger)]" role="alert">
					{error}
				</p>
			) : null}
		</div>
	);
}
