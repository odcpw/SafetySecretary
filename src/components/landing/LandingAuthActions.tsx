"use client";

import { useState } from "react";

export type LandingAuthCopy = {
	signIn: string;
	tryWorkspace: string;
	starting: string;
	error: string;
};

type LandingAuthActionsProps = {
	readonly copy: LandingAuthCopy;
};

const DEV_AUTH_BYPASS_ENABLED =
	process.env.NEXT_PUBLIC_SSFW_DEV_AUTH_BYPASS === "1";

const primaryButton =
	"inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 text-[var(--text-sm)] font-medium text-[var(--color-bg)] outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]";

const secondaryButton =
	"inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-[var(--text-sm)] font-medium text-[var(--color-text)] outline-none transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elev)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] disabled:cursor-wait disabled:opacity-70";

/**
 * Auth entry points for the landing page.
 *
 * - "Sign in" always links to the magic-link page at /signin.
 * - "Try it (test workspace)" only renders when the public dev-bypass flag is
 *   on. It mirrors the dev-session call shape used by src/app/signin/page.tsx
 *   exactly (POST /api/auth/dev-session, same-origin credentials, JSON body
 *   with returnTo) and navigates to the server-returned redirect on success.
 */
export default function LandingAuthActions({ copy }: LandingAuthActionsProps) {
	const [isDevSubmitting, setIsDevSubmitting] = useState(false);
	const [error, setError] = useState("");

	async function handleDevSession() {
		setIsDevSubmitting(true);
		setError("");

		try {
			const response = await fetch("/api/auth/dev-session", {
				method: "POST",
				credentials: "same-origin",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ returnTo: "/incidents" }),
			});
			const payload = (await response.json().catch(() => null)) as {
				message?: string;
				redirectTo?: string;
			} | null;

			if (!response.ok) {
				throw new Error(payload?.message ?? "DEV_SESSION_FAILED");
			}

			window.location.assign(payload?.redirectTo ?? "/incidents");
		} catch {
			setError(copy.error);
			setIsDevSubmitting(false);
		}
	}

	return (
		<div className="flex flex-col gap-2.5">
			<div className="flex flex-wrap items-center gap-2.5">
				<a className={primaryButton} href="/signin">
					{copy.signIn}
				</a>
				{DEV_AUTH_BYPASS_ENABLED ? (
					<button
						className={secondaryButton}
						disabled={isDevSubmitting}
						onClick={handleDevSession}
						type="button"
					>
						{isDevSubmitting ? copy.starting : copy.tryWorkspace}
					</button>
				) : null}
			</div>
			{error ? (
				<p
					aria-live="polite"
					className="m-0 text-[var(--text-sm)] text-[var(--color-muted)]"
				>
					{error}
				</p>
			) : null}
		</div>
	);
}
