"use client";

import Image from "next/image";
import { useState } from "react";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import { ensureCsrfToken } from "../VisionConsentModal";
import type { CoachCopy } from "./copy";
import PhotoLightbox from "./PhotoLightbox";
import type { RecordEvidence } from "./types";

type PhotosTabProps = {
	readonly incidentId: string;
	readonly photos: RecordEvidence[];
	readonly copy: CoachCopy;
	readonly onRecordChange?: () => void;
};

const maxCaptionLength = 2000;

export default function PhotosTab({
	incidentId,
	photos,
	copy,
	onRecordChange,
}: PhotosTabProps) {
	const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
	const [editing, setEditing] = useState<{
		photoId: string;
		text: string;
	} | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const openPhoto = photos.find((photo) => photo.id === openPhotoId) ?? null;

	if (photos.length === 0) {
		return (
			<p className="m-0 rounded-md border border-dashed border-[var(--color-border)] px-3 py-4 text-sm text-[var(--color-muted)]">
				{copy.photos.emptyTab}
			</p>
		);
	}

	async function saveCaption(photoId: string, text: string) {
		setSaving(true);
		setError(null);

		try {
			const caption = text.trim().slice(0, maxCaptionLength);
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(
					incidentId,
				)}/coach/photos/${encodeURIComponent(photoId)}`,
				{
					body: JSON.stringify({ caption: caption || null }),
					credentials: "same-origin",
					headers: {
						"content-type": "application/json",
						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
					},
					method: "PATCH",
				},
			);

			if (!response.ok) {
				throw new Error(`CAPTION_SAVE_FAILED_${response.status}`);
			}

			setEditing(null);
			onRecordChange?.();
		} catch {
			setError(copy.photos.captionSaveFailed);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="grid gap-3">
			{error ? (
				<p className="m-0 rounded-md border border-[var(--color-danger)] px-3 py-2 text-sm text-[var(--color-danger)]">
					{error}
				</p>
			) : null}
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				{photos.map((photo) => {
					const isEditing = editing?.photoId === photo.id;

					return (
						<div
							className="grid content-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] p-2"
							key={photo.id}
						>
							<button
								className="block overflow-hidden rounded-md border border-[var(--color-border)] transition hover:border-[var(--color-accent)]"
								onClick={() => setOpenPhotoId(photo.id)}
								title={photo.filename ?? copy.photos.incidentPhoto}
								type="button"
							>
								<Image
									alt={
										photo.caption ??
										photo.filename ??
										copy.photos.incidentPhoto
									}
									className="h-28 w-full object-cover"
									height={112}
									src={`/api/storage/${photo.storageKey}`}
									unoptimized
									width={200}
								/>
							</button>
							{isEditing && editing ? (
								<div className="grid gap-2">
									<textarea
										className="min-h-16 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
										maxLength={maxCaptionLength}
										onChange={(event) => {
											const text = event.currentTarget.value;
											setEditing((current) =>
												current ? { ...current, text } : current,
											);
										}}
										placeholder={copy.photos.whatShows}
										rows={3}
										// biome-ignore lint/a11y/noAutofocus: the textarea opens on the user's click and focus should follow it.
										autoFocus
										value={editing.text}
									/>
									<div className="flex gap-2">
										<button
											className="inline-flex items-center justify-center rounded-md bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
											disabled={saving}
											onClick={() => void saveCaption(photo.id, editing.text)}
											type="button"
										>
											{copy.photos.save}
										</button>
										<button
											className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
											disabled={saving}
											onClick={() => setEditing(null)}
											type="button"
										>
											{copy.photos.cancel}
										</button>
									</div>
								</div>
							) : (
								<button
									className={`m-0 cursor-text border-0 bg-transparent p-0 text-left text-xs leading-5 ${
										photo.caption
											? "text-[var(--color-text)]"
											: "text-[var(--color-muted)]"
									}`}
									onClick={() =>
										setEditing({ photoId: photo.id, text: photo.caption ?? "" })
									}
									title={copy.photos.editDescription}
									type="button"
								>
									{photo.caption ?? copy.photos.addDescription}
								</button>
							)}
						</div>
					);
				})}
			</div>
			{openPhoto ? (
				<PhotoLightbox
					labels={{
						analysing: copy.photos.analysing,
						askCoach: copy.photos.askCoach,
						close: copy.photos.close,
						incidentPhoto: copy.photos.incidentPhoto,
						photo: copy.photos.photo,
					}}
					onClose={() => setOpenPhotoId(null)}
					photo={openPhoto}
				/>
			) : null}
		</div>
	);
}
