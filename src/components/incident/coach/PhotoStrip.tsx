"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import type { CoachPhoto } from "../../../lib/incident/coach-photos";
import type { WorkflowVisionConsent } from "../../../lib/llm/consent";
import { ensureCsrfToken, VisionConsentModal } from "../VisionConsentModal";
import type { CoachCopy } from "./copy";
import PhotoLightbox from "./PhotoLightbox";

type PhotoStripProps = {
	readonly incidentId: string;
	readonly locale: string;
	readonly copy: CoachCopy;
	readonly onChatRefresh: () => Promise<void> | void;
};

export default function PhotoStrip({
	incidentId,
	locale,
	copy,
	onChatRefresh,
}: PhotoStripProps) {
	const visionConsentLabels = copy.vision;
	const [photos, setPhotos] = useState<CoachPhoto[]>([]);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
	const [analysing, setAnalysing] = useState(false);
	const [analysisError, setAnalysisError] = useState("");
	const [consentOpen, setConsentOpen] = useState(false);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(incidentId)}/coach/photos`,
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
	}, [incidentId]);

	const openPhoto = photos.find((photo) => photo.id === openPhotoId) ?? null;

	async function upload(file: File) {
		setUploading(true);
		setError(null);

		try {
			const formData = new FormData();
			formData.set("file", file);
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(incidentId)}/coach/photos`,
				{
					body: formData,
					credentials: "same-origin",
					headers: {
						"x-safetysecretary-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
					},
					method: "POST",
				},
			);
			const body = (await response.json().catch(() => ({}))) as {
				photo?: CoachPhoto;
				code?: string;
			};

			if (!response.ok || !body.photo) {
				throw new Error(body.code ?? `UPLOAD_FAILED_${response.status}`);
			}

			const photo = body.photo;
			setPhotos((current) => [...current, photo]);
		} catch (caught) {
			setError(uploadErrorMessage(caught, copy));
		} finally {
			setUploading(false);

			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	}

	async function analyse(photo: CoachPhoto, modalGranted: boolean) {
		setAnalysing(true);
		setAnalysisError("");

		try {
			const headers: Record<string, string> = {
				"content-type": "application/json",
				"x-safetysecretary-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
			};

			if (modalGranted) {
				headers["x-safetysecretary-vision-modal-granted"] = "true";
			}

			const response = await fetch(
				`/api/incidents/${encodeURIComponent(
					incidentId,
				)}/coach/photos/${encodeURIComponent(photo.id)}/analyse`,
				{
					body: JSON.stringify({ locale }),
					credentials: "same-origin",
					headers,
					method: "POST",
				},
			);
			const body = (await response.json().catch(() => ({}))) as {
				code?: string;
				suggestedCaption?: string | null;
			};

			if (response.ok) {
				await onChatRefresh();

				// Offer the analysis as the photo's description when it has none.
				if (body.suggestedCaption && !photo.caption) {
					const useIt = window.confirm(
						`${copy.photos.useDescriptionPrompt}\n\n"${body.suggestedCaption}"`,
					);

					if (useIt) {
						await fetch(
							`/api/incidents/${encodeURIComponent(
								incidentId,
							)}/coach/photos/${encodeURIComponent(photo.id)}`,
							{
								body: JSON.stringify({ caption: body.suggestedCaption }),
								credentials: "same-origin",
								headers: {
									"content-type": "application/json",
									"x-safetysecretary-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
								},
								method: "PATCH",
							},
						).catch(() => undefined);
						await onChatRefresh();
					}
				}

				setOpenPhotoId(null);
				return;
			}

			if (body.code === "VISION_CONSENT_REQUIRED") {
				setConsentOpen(true);
				return;
			}

			setAnalysisError(analysisErrorMessage(body.code, copy));
		} catch {
			setAnalysisError(analysisErrorMessage(undefined, copy));
		} finally {
			setAnalysing(false);
		}
	}

	function handleConsent(consent: WorkflowVisionConsent) {
		setConsentOpen(false);

		if (consent === "NEVER") {
			setAnalysisError(visionConsentLabels.workflowUnavailable);
			return;
		}

		if (openPhoto) {
			void analyse(openPhoto, true);
		}
	}

	return (
		<div className="border-t border-[var(--color-border)] px-3 pt-2">
			<div className="flex flex-wrap items-center gap-2">
				<button
					className="inline-flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-[var(--color-border)] text-lg text-[var(--color-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
					disabled={uploading}
					onClick={() => fileInputRef.current?.click()}
					title={copy.photos.addTitle}
					type="button"
				>
					{uploading ? "…" : "+"}
				</button>
				<input
					accept="image/*"
					className="hidden"
					onChange={(event) => {
						const file = event.currentTarget.files?.[0];

						if (file) {
							void upload(file);
						}
					}}
					ref={fileInputRef}
					type="file"
				/>
				{photos.map((photo) => (
					<button
						className="h-12 w-12 overflow-hidden rounded-md border border-[var(--color-border)] transition hover:border-[var(--color-accent)]"
						key={photo.id}
						onClick={() => {
							setAnalysisError("");
							setOpenPhotoId(photo.id);
						}}
						title={photo.filename ?? copy.photos.incidentPhoto}
						type="button"
					>
						<Image
							alt={photo.filename ?? copy.photos.incidentPhoto}
							className="h-full w-full object-cover"
							height={48}
							src={`/api/storage/${photo.storageKey}`}
							unoptimized
							width={48}
						/>
					</button>
				))}
				<p className="m-0 text-xs text-[var(--color-muted)]">
					{photos.length === 0 ? copy.photos.emptyStrip : copy.photos.clickHint}
				</p>
			</div>
			{error ? (
				<p className="m-0 mt-1 text-xs text-[var(--color-danger)]">{error}</p>
			) : null}
			{openPhoto ? (
				<PhotoLightbox
					analysing={analysing}
					error={analysisError}
					labels={{
						analysing: copy.photos.analysing,
						askCoach: copy.photos.askCoach,
						close: copy.photos.close,
						incidentPhoto: copy.photos.incidentPhoto,
						photo: copy.photos.photo,
					}}
					onAnalyse={() => void analyse(openPhoto, false)}
					onClose={() => setOpenPhotoId(null)}
					photo={openPhoto}
				/>
			) : null}
			<VisionConsentModal
				companyVisionEnabled={true}
				incidentId={incidentId}
				initialConsent="ASK"
				labels={visionConsentLabels}
				onCancel={() => setConsentOpen(false)}
				onConsent={handleConsent}
				open={consentOpen}
				requiresVision={true}
			/>
		</div>
	);
}

function uploadErrorMessage(caught: unknown, copy: CoachCopy): string {
	const code = caught instanceof Error ? caught.message : "";
	const map: Record<string, string> = {
		UNSUPPORTED_CONTENT_TYPE: copy.photos.uploadUnsupported,
		UPLOAD_TOO_LARGE: copy.photos.uploadTooLarge,
	};

	return map[code] ?? copy.photos.uploadFailed;
}

function analysisErrorMessage(
	code: string | undefined,
	copy: CoachCopy,
): string {
	const map: Record<string, string> = {
		MONTHLY_CAP_EXCEEDED: copy.photos.analysisMonthlyCap,
		PHOTO_NOT_FOUND: copy.photos.analysisNotFound,
		PROVIDER_FAILED: copy.photos.analysisProviderFailed,
		VISION_UNAVAILABLE_COMPANY: copy.photos.analysisVisionCompany,
		VISION_UNAVAILABLE_WORKFLOW: copy.photos.analysisVisionWorkflow,
	};

	return map[code ?? ""] ?? copy.photos.analysisGeneric;
}
