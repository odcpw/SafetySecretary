"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

type LightboxPhoto = {
	readonly storageKey: string;
	readonly filename: string | null;
};

export type PhotoLightboxLabels = {
	analysing: string;
	askCoach: string;
	close: string;
	incidentPhoto: string;
	photo: string;
};

const defaultLabels: PhotoLightboxLabels = {
	analysing: "Analysing…",
	askCoach: "Ask the coach about this photo",
	close: "Close",
	incidentPhoto: "Incident photo",
	photo: "Photo",
};

type PhotoLightboxProps = {
	readonly photo: LightboxPhoto;
	readonly analysing?: boolean;
	readonly error?: string;
	readonly labels?: PhotoLightboxLabels;
	readonly onAnalyse?: () => void;
	readonly onClose: () => void;
};

export default function PhotoLightbox({
	photo,
	analysing = false,
	error = "",
	labels = defaultLabels,
	onAnalyse,
	onClose,
}: PhotoLightboxProps) {
	const closeButtonRef = useRef<HTMLButtonElement | null>(null);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				onClose();
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	useEffect(() => {
		closeButtonRef.current?.focus();
	}, []);

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: Esc already closes the dialog via the window listener.
		<div
			aria-label={photo.filename ?? labels.incidentPhoto}
			aria-modal="true"
			className="fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_srgb,var(--color-bg)_78%,transparent)] p-4"
			onClick={(event) => {
				if (event.target === event.currentTarget) {
					onClose();
				}
			}}
			role="dialog"
		>
			<div className="grid max-h-[90vh] w-full max-w-3xl gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xl">
				<Image
					alt={photo.filename ?? labels.incidentPhoto}
					className="max-h-[70vh] w-full rounded-md bg-[var(--color-bg)] object-contain"
					height={720}
					src={`/api/storage/${photo.storageKey}`}
					unoptimized
					width={1280}
				/>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className="m-0 min-w-0 truncate text-xs text-[var(--color-muted)]">
						{photo.filename ?? labels.photo}
					</p>
					<div className="flex flex-wrap items-center gap-2">
						{onAnalyse ? (
							<button
								className="inline-flex items-center justify-center rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
								disabled={analysing}
								onClick={onAnalyse}
								type="button"
							>
								{analysing ? labels.analysing : labels.askCoach}
							</button>
						) : null}
						<button
							className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)]"
							onClick={onClose}
							ref={closeButtonRef}
							type="button"
						>
							{labels.close}
						</button>
					</div>
				</div>
				{error ? (
					<p className="m-0 text-sm text-[var(--color-danger)]" role="alert">
						{error}
					</p>
				) : null}
			</div>
		</div>
	);
}
