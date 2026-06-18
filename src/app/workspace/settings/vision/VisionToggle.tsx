"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ensureCsrfToken } from "../../../../lib/auth/csrf-client";

export type VisionToggleLabels = {
	disable: string;
	enable: string;
	error: string;
	offStatus: string;
	onStatus: string;
	pending: string;
};

type VisionToggleProps = {
	initialEnabled: boolean;
	labels: VisionToggleLabels;
};

const csrfCookieName = "ssfw_csrf";
const csrfHeaderName = "x-ssfw-csrf";

export function VisionToggle({ initialEnabled, labels }: VisionToggleProps) {
	const router = useRouter();
	const [enabled, setEnabled] = useState(initialEnabled);
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);
	const nextEnabled = !enabled;

	async function handleToggle() {
		setError("");
		setPending(true);

		try {
			const csrfToken = ensureCsrfToken(csrfCookieName);
			const response = await fetch("/api/settings/vision", {
				body: JSON.stringify({ visionEnabled: nextEnabled }),
				credentials: "same-origin",
				headers: {
					"content-type": "application/json",
					[csrfHeaderName]: csrfToken,
				},
				method: "POST",
			});

			if (response.ok) {
				const body = (await response.json()) as { visionEnabled?: boolean };
				setEnabled(Boolean(body.visionEnabled));
				router.refresh();
				return;
			}

			if (response.status === 401) {
				window.location.assign("/signin");
				return;
			}

			setError(labels.error);
		} catch {
			setError(labels.error);
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="grid gap-3">
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] p-4">
				<p className="m-0 text-sm font-medium text-[var(--color-text)]">
					{enabled ? labels.onStatus : labels.offStatus}
				</p>
				<button
					aria-checked={enabled}
					className="inline-flex min-h-9 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] disabled:cursor-wait disabled:opacity-70"
					disabled={pending}
					onClick={handleToggle}
					role="switch"
					type="button"
				>
					{pending
						? labels.pending
						: nextEnabled
							? labels.enable
							: labels.disable}
				</button>
			</div>
			{error ? (
				<p className="m-0 text-sm text-[var(--color-danger)]" role="alert">
					{error}
				</p>
			) : null}
		</div>
	);
}
