"use client";

import { useState } from "react";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import { ensureCsrfToken } from "../../../lib/auth/csrf-client";

// Per-investigation cause-analysis method selector. PATCHes /cause-method and
// refreshes the record, so the chosen method drives both the coach's questioning
// and which graph renders (tree for 5-Why/Ursachenbaum, fishbone for Ishikawa).
// Without this control every case was stuck on the FIVE_WHYS default.

const METHODS = ["FIVE_WHYS", "URSACHENBAUM", "ISHIKAWA"] as const;

const LABELS: Record<
	string,
	{ heading: string; options: Record<(typeof METHODS)[number], string> }
> = {
	en: {
		heading: "Method",
		options: {
			FIVE_WHYS: "5 Whys",
			URSACHENBAUM: "Cause tree (Ursachenbaum)",
			ISHIKAWA: "Ishikawa (fishbone)",
		},
	},
	de: {
		heading: "Methode",
		options: {
			FIVE_WHYS: "5-Warum",
			URSACHENBAUM: "Ursachenbaum",
			ISHIKAWA: "Ishikawa (Fischgräte)",
		},
	},
	fr: {
		heading: "Méthode",
		options: {
			FIVE_WHYS: "5 Pourquoi",
			URSACHENBAUM: "Arbre des causes",
			ISHIKAWA: "Ishikawa (arêtes)",
		},
	},
	it: {
		heading: "Metodo",
		options: {
			FIVE_WHYS: "5 Perché",
			URSACHENBAUM: "Albero delle cause",
			ISHIKAWA: "Ishikawa (a lisca)",
		},
	},
};

function labelsFor(locale: string) {
	return LABELS[locale.split("-")[0]?.toLowerCase() ?? "en"] ?? LABELS.en;
}

// The localized display name of a method, reused by the chat workbench when it
// posts the "I've switched the method to …" note on a method change.
export function causeMethodLabel(method: string, locale: string): string {
	const key = (METHODS as readonly string[]).includes(method)
		? (method as (typeof METHODS)[number])
		: "FIVE_WHYS";
	return labelsFor(locale).options[key];
}

export default function CauseMethodToggle({
	incidentId,
	method,
	locale,
	onChange,
	onSwitched,
}: {
	readonly incidentId: string;
	readonly method?: string | null;
	readonly locale: string;
	readonly onChange?: () => void;
	/** Fired with the new method after a successful switch — used to nudge the coach. */
	readonly onSwitched?: (next: string) => void;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const labels = labelsFor(locale);
	const current = (METHODS as readonly string[]).includes(method ?? "")
		? (method as (typeof METHODS)[number])
		: "FIVE_WHYS";

	async function select(next: string) {
		if (next === current || busy) {
			return;
		}
		setBusy(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(incidentId)}/cause-method`,
				{
					body: JSON.stringify({ causeMethod: next }),
					credentials: "same-origin",
					headers: {
						accept: "application/json",
						"content-type": "application/json",
						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
					},
					method: "PATCH",
				},
			);
			if (!response.ok) {
				const payload = (await response.json().catch(() => ({}))) as {
					code?: string;
				};
				throw new Error(
					payload.code ?? `METHOD_SAVE_FAILED_${response.status}`,
				);
			}
			onChange?.();
			onSwitched?.(next);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "METHOD_SAVE_FAILED");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
			<label
				className="font-medium uppercase tracking-wide"
				htmlFor="cause-method-select"
			>
				{labels.heading}
			</label>
			<select
				className="min-h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text)] disabled:opacity-60"
				disabled={busy}
				id="cause-method-select"
				onChange={(event) => void select(event.target.value)}
				value={current}
			>
				{METHODS.map((m) => (
					<option key={m} value={m}>
						{labels.options[m]}
					</option>
				))}
			</select>
			{error ? (
				<span className="text-[var(--color-danger)]">{error}</span>
			) : null}
		</div>
	);
}
