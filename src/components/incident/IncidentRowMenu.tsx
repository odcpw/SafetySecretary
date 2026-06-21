"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { CSRF_COOKIE_NAME } from "../../lib/auth/cookies";
import { ensureCsrfToken } from "../../lib/auth/csrf-client";

export type IncidentRowMenuLabels = {
	readonly menu: string;
	readonly open: string;
	readonly delete: string;
	readonly confirm: string;
	readonly error: string;
};

type IncidentRowMenuProps = {
	readonly incidentId: string;
	readonly labels: IncidentRowMenuLabels;
};

/**
 * Per-row kebab ("⋯") menu on the incident register. Lets a frontline manager
 * open the coach or soft-delete the case. Delete asks a confirm, then DELETEs
 * /api/incidents/{id} with the double-submit CSRF header and refreshes the
 * list. Errors surface inline and re-enable the button rather than throwing.
 */
export default function IncidentRowMenu({
	incidentId,
	labels,
}: IncidentRowMenuProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const menuId = useId();

	useEffect(() => {
		if (!open) {
			return;
		}

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setOpen(false);
			}
		}

		// Close when focus or a pointer leaves the menu group (blur/outside click).
		function onAway(event: FocusEvent | PointerEvent) {
			const target = event.target;
			if (target instanceof Node && !containerRef.current?.contains(target)) {
				setOpen(false);
			}
		}

		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("focusin", onAway);
		document.addEventListener("pointerdown", onAway);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("focusin", onAway);
			document.removeEventListener("pointerdown", onAway);
		};
	}, [open]);

	function openCoach() {
		setOpen(false);
		router.push(`/incidents/${incidentId}/coach`);
	}

	async function remove() {
		if (busy) {
			return;
		}

		if (!window.confirm(labels.confirm)) {
			return;
		}

		setBusy(true);
		setError(null);

		try {
			const response = await fetch(`/api/incidents/${incidentId}`, {
				credentials: "same-origin",
				headers: {
					accept: "application/json",
					"x-safetysecretary-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
				},
				method: "DELETE",
			});

			if (!response.ok) {
				setError(labels.error);
				setBusy(false);
				return;
			}

			setOpen(false);
			router.refresh();
		} catch {
			setError(labels.error);
			setBusy(false);
		}
	}

	return (
		<div className="relative flex justify-end" ref={containerRef}>
			<button
				aria-expanded={open}
				aria-haspopup="menu"
				aria-label={labels.menu}
				className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elev)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-60 aria-expanded:border-[var(--color-accent)] aria-expanded:bg-[var(--color-surface-elev)]"
				disabled={busy}
				onClick={() => setOpen((value) => !value)}
				type="button"
			>
				<span aria-hidden="true" className="text-lg leading-none">
					⋯
				</span>
			</button>
			{open ? (
				<div
					className="absolute right-0 top-9 z-10 min-w-36 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] py-1 shadow-lg"
					id={menuId}
					role="menu"
				>
					<button
						className="block w-full px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-surface)]"
						onClick={openCoach}
						role="menuitem"
						type="button"
					>
						{labels.open}
					</button>
					<button
						className="block w-full px-3 py-1.5 text-left text-sm text-[var(--color-danger)] hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-60"
						disabled={busy}
						onClick={() => void remove()}
						role="menuitem"
						type="button"
					>
						{labels.delete}
					</button>
				</div>
			) : null}
			{error ? (
				<p
					className="absolute right-0 top-9 z-10 m-0 max-w-48 rounded-md border border-[var(--color-danger)] bg-[var(--color-surface-elev)] px-2 py-1 text-xs text-[var(--color-danger)]"
					role="alert"
				>
					{error}
				</p>
			) : null}
		</div>
	);
}
