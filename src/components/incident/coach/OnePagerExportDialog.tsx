"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { LOCALES, type Locale } from "../../../lib/i18n/types";
import type { CoachPhoto } from "../../../lib/incident/coach-photos";

export type OnePagerExportDialogLabels = {
	title: string;
	intro: string;
	exportLocale: string;
	localeNames: Record<Locale, string>;
	photoSelectHint: string;
	noPhotos: string;
	generate: string;
	generating: string;
	failed: string;
	maxPhotosNote: string;
};

export type OnePagerExportDialogProps = {
	caseId: string;
	defaultExportLocale: Locale;
	labels: OnePagerExportDialogLabels;
	action?: string;
	maxPhotos?: number;
};

const DEFAULT_MAX_PHOTOS = 3;

/**
 * Photo selector + generate step for the manager one-pager. The user picks up
 * to three of the incident's photos, then generates the slide: the export route
 * drafts it (LLM) and returns the PPTX, which we download. Uses fetch + a blob
 * download rather than a plain form submit so the button can show a real
 * "generating" state — the LLM draft takes a few seconds and a bare submit
 * gave no feedback, which read as "the one-pager doesn't work".
 */
export default function OnePagerExportDialog({
	caseId,
	defaultExportLocale,
	labels,
	action,
	maxPhotos = DEFAULT_MAX_PHOTOS,
}: OnePagerExportDialogProps) {
	const [photos, setPhotos] = useState<CoachPhoto[]>([]);
	const [selected, setSelected] = useState<string[]>([]);
	const [exportLocale, setExportLocale] = useState<Locale>(defaultExportLocale);
	const [generating, setGenerating] = useState(false);
	const [error, setError] = useState("");
	const exportAction = action ?? `/api/incidents/${caseId}/export`;

	useEffect(() => {
		let cancelled = false;

		async function load() {
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(caseId)}/coach/photos`,
				{ credentials: "same-origin" },
			);

			if (!cancelled && response.ok) {
				const body = (await response.json()) as { photos: CoachPhoto[] };
				setPhotos(body.photos);
			}
		}

		void load();

		return () => {
			cancelled = true;
		};
	}, [caseId]);

	function toggle(photoId: string) {
		setSelected((current) => {
			if (current.includes(photoId)) {
				return current.filter((id) => id !== photoId);
			}

			if (current.length >= maxPhotos) {
				return current;
			}

			return [...current, photoId];
		});
	}

	async function generate() {
		setGenerating(true);
		setError("");

		try {
			const params = new URLSearchParams();
			params.set("report", "onepager");
			params.set("format", "pptx");
			params.set("locale", exportLocale);

			for (const id of selected) {
				params.append("photoId", id);
			}

			const response = await fetch(`${exportAction}?${params.toString()}`, {
				credentials: "same-origin",
			});

			if (!response.ok) {
				throw new Error(`EXPORT_${response.status}`);
			}

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download =
				filenameFromDisposition(response.headers.get("content-disposition")) ??
				"one-pager.pptx";
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(url);
		} catch {
			setError(labels.failed);
		} finally {
			setGenerating(false);
		}
	}

	return (
		<form
			className="grid gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				void generate();
			}}
		>
			<h2 className="m-0 text-lg font-semibold">{labels.title}</h2>
			<p className="m-0 text-sm text-[var(--color-muted)]">{labels.intro}</p>

			<label className="grid gap-1">
				<span className="text-sm">{labels.exportLocale}</span>
				<select
					className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
					name="locale"
					onChange={(event) => setExportLocale(event.target.value as Locale)}
					value={exportLocale}
				>
					{LOCALES.map((locale) => (
						<option key={locale} value={locale}>
							{labels.localeNames[locale]}
						</option>
					))}
				</select>
			</label>

			<div className="grid gap-1">
				<span className="text-sm">{labels.photoSelectHint}</span>
				{photos.length === 0 ? (
					<p className="m-0 text-xs text-[var(--color-muted)]">
						{labels.noPhotos}
					</p>
				) : (
					<div className="flex flex-wrap gap-2">
						{photos.map((photo) => {
							const isSelected = selected.includes(photo.id);
							const order = selected.indexOf(photo.id) + 1;

							return (
								<button
									aria-pressed={isSelected}
									className={`relative h-20 w-20 overflow-hidden rounded-md border-2 transition ${
										isSelected
											? "border-[var(--color-accent)]"
											: "border-[var(--color-border)]"
									}`}
									key={photo.id}
									onClick={() => toggle(photo.id)}
									title={photo.filename ?? "Incident photo"}
									type="button"
								>
									<Image
										alt={photo.filename ?? "Incident photo"}
										className="h-full w-full object-cover"
										height={80}
										src={`/api/storage/${photo.storageKey}`}
										unoptimized
										width={80}
									/>
									{isSelected ? (
										<span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-bold text-white">
											{order}
										</span>
									) : null}
								</button>
							);
						})}
					</div>
				)}
				<p className="m-0 text-xs text-[var(--color-muted)]">
					{labels.maxPhotosNote}
				</p>
			</div>

			{error ? (
				<p className="m-0 text-sm text-[var(--color-danger)]">{error}</p>
			) : null}

			<div className="flex flex-wrap gap-2">
				<button
					className="inline-flex items-center justify-center rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
					disabled={generating}
					type="submit"
				>
					{generating ? labels.generating : labels.generate}
				</button>
			</div>
		</form>
	);
}

function filenameFromDisposition(value: string | null): string | null {
	if (!value) {
		return null;
	}

	const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(value);
	return match ? decodeURIComponent(match[1]) : null;
}
