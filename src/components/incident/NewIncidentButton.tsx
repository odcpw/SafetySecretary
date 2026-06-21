"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CSRF_COOKIE_NAME } from "../../lib/auth/cookies";
import { ensureCsrfToken } from "../../lib/auth/csrf-client";

type NewIncidentButtonProps = {
	readonly label: string;
};

/**
 * Chat-first entry point. POSTs a blank draft to /api/incidents?draft=1 and
 * navigates to the coach chat for the new incident. There is no manual form
 * gate: the coach opens immediately on a brand-new investigation.
 */
export default function NewIncidentButton({ label }: NewIncidentButtonProps) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);

	async function create() {
		if (busy) {
			return;
		}

		setBusy(true);

		try {
			const response = await fetch("/api/incidents?draft=1", {
				body: "{}",
				credentials: "same-origin",
				headers: {
					accept: "application/json",
					"content-type": "application/json",
					"x-safetysecretary-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
				},
				method: "POST",
			});

			if (!response.ok) {
				setBusy(false);
				return;
			}

			const body = (await response.json().catch(() => null)) as {
				redirectTo?: string;
			} | null;

			if (body?.redirectTo) {
				router.push(body.redirectTo);
				return;
			}

			setBusy(false);
		} catch {
			setBusy(false);
		}
	}

	return (
		<button
			className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-60"
			disabled={busy}
			onClick={() => void create()}
			type="button"
		>
			<span aria-hidden="true">+</span>
			<span>{label}</span>
		</button>
	);
}
