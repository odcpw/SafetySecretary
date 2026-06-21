"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import InspectorPanel from "../../../components/layout/InspectorPanel";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import DataTable from "../../../components/ui/DataTable";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import StatusBadge from "../../../components/ui/StatusBadge";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
import type { ChemicalProfileStatus } from "../../../lib/chemicals/chemical-profile";
import type { ChemicalExtractionStatus } from "../../../lib/chemicals/fixtures";
import type { SerializedChemicalProfileDetail } from "../../../lib/chemicals/queries";
import type { ChemicalProfileViewLabels } from "../../../lib/chemicals/view-labels";

type ChemicalProfilesClientProps = {
	readonly initialProfileId?: string | null;
	readonly initialProfiles: readonly SerializedChemicalProfileDetail[];
	readonly labels: ChemicalProfileViewLabels;
};

type ChemicalProfileFormState = {
	productName: string;
	manufacturer: string;
	casNumber: string;
	unNumber: string;
	profileStatus: ChemicalProfileStatus;
	storagePath: string;
};

const emptyFormState: ChemicalProfileFormState = {
	casNumber: "",
	manufacturer: "",
	productName: "",
	profileStatus: "draft",
	storagePath: "",
	unNumber: "",
};

const profileStatusOptions: Array<ChemicalProfileStatus | "all"> = [
	"all",
	"draft",
	"active",
	"archived",
];

export default function ChemicalProfilesClient({
	initialProfileId,
	initialProfiles,
	labels,
}: ChemicalProfilesClientProps) {
	const router = useRouter();
	const initialSelectedId = selectedInitialProfileId(
		initialProfiles,
		initialProfileId,
	);
	const [profiles, setProfiles] = useState([...initialProfiles]);
	const [selectedId, setSelectedId] = useState<string | null>(
		initialSelectedId ?? initialProfiles[0]?.id ?? null,
	);
	const [panelMode, setPanelMode] = useState<"create" | "edit" | null>(null);
	const [detailOpen, setDetailOpen] = useState(Boolean(initialSelectedId));
	const [formState, setFormState] =
		useState<ChemicalProfileFormState>(emptyFormState);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<
		ChemicalProfileStatus | "all"
	>("all");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sdsFile, setSdsFile] = useState<File | null>(null);
	const selectedProfile =
		profiles.find((profile) => profile.id === selectedId) ??
		profiles[0] ??
		null;
	const filteredProfiles = useMemo(
		() => filterProfiles(profiles, search, statusFilter),
		[profiles, search, statusFilter],
	);

	function openCreate() {
		setError(null);
		setFormState(emptyFormState);
		setDetailOpen(false);
		setPanelMode("create");
	}

	function openDetail(profile: SerializedChemicalProfileDetail) {
		setError(null);
		setSelectedId(profile.id);
		setPanelMode(null);
		setDetailOpen(true);
	}

	function openEdit(profile: SerializedChemicalProfileDetail) {
		setError(null);
		setSelectedId(profile.id);
		setDetailOpen(false);
		setFormState({
			casNumber: profile.casNumber ?? "",
			manufacturer: profile.manufacturer,
			productName: profile.productName,
			profileStatus: profile.profileStatus,
			storagePath: profile.storagePath ?? "",
			unNumber: profile.unNumber ?? "",
		});
		setPanelMode("edit");
	}

	async function saveProfile() {
		setPending(true);
		setError(null);

		try {
			const profile = await submitProfile({
				formState,
				id: panelMode === "edit" ? selectedProfile?.id : null,
				method: panelMode === "edit" ? "PATCH" : "POST",
			});
			upsertProfile(profile);
			setSelectedId(profile.id);
			setDetailOpen(true);
			setPanelMode(null);
			router.refresh();
		} catch {
			setError(labels.error);
		} finally {
			setPending(false);
		}
	}

	async function archiveProfile() {
		if (!selectedProfile) {
			return;
		}

		setPending(true);
		setError(null);

		try {
			const profile = await submitArchive(selectedProfile.id);
			upsertProfile(profile);
			setSelectedId(profile.id);
			setDetailOpen(true);
			setPanelMode(null);
			router.refresh();
		} catch {
			setError(labels.error);
		} finally {
			setPending(false);
		}
	}

	async function extractSds(profile: SerializedChemicalProfileDetail) {
		if (!sdsFile) {
			setError(labels.sds.uploadFailed);
			return;
		}

		setPending(true);
		setError(null);

		try {
			const updated = await submitSdsExtraction({
				file: sdsFile,
				profileId: profile.id,
			});
			upsertProfile(updated);
			setSelectedId(updated.id);
			setDetailOpen(true);
			setSdsFile(null);
			router.refresh();
		} catch {
			setError(labels.sds.uploadFailed);
		} finally {
			setPending(false);
		}
	}

	async function reviewSdsControl(input: {
		profile: SerializedChemicalProfileDetail;
		controlId: string;
		decision: "approved" | "rejected";
	}) {
		setPending(true);
		setError(null);

		try {
			const updated = await submitSdsReview({
				controlId: input.controlId,
				decision: input.decision,
				profileId: input.profile.id,
			});
			upsertProfile(updated);
			setSelectedId(updated.id);
			setDetailOpen(true);
			router.refresh();
		} catch {
			setError(labels.sds.reviewFailed);
		} finally {
			setPending(false);
		}
	}

	function upsertProfile(profile: SerializedChemicalProfileDetail) {
		setProfiles((current) => {
			const index = current.findIndex((item) => item.id === profile.id);

			if (index < 0) {
				return [profile, ...current];
			}

			return current.map((item) => (item.id === profile.id ? profile : item));
		});
	}

	return (
		<div className="grid gap-4">
			<section className="grid gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
					<div className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_14rem]">
						<Input
							label={labels.filters.search}
							onChange={(event) => setSearch(event.currentTarget.value)}
							type="search"
							value={search}
						/>
						<Select
							label={labels.filters.label}
							onChange={(value) =>
								setStatusFilter(value as ChemicalProfileStatus | "all")
							}
							options={profileStatusOptions.map((value) => ({
								label:
									value === "all"
										? labels.filters.all
										: labels.profileStatus[value],
								value,
							}))}
							value={statusFilter}
						/>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<a
							className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] outline-none transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elev)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
							href="/workspace/chemicals/grouping"
						>
							<span className="truncate">{labels.actions.grouping}</span>
						</a>
						<a
							className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] outline-none transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elev)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
							href="/workspace/chemicals/recap"
						>
							<span className="truncate">{labels.actions.recap}</span>
						</a>
						<Button onClick={openCreate} type="button">
							{labels.actions.add}
						</Button>
					</div>
				</div>

				{filteredProfiles.length === 0 ? (
					<div className="grid gap-2 rounded-md border border-dashed border-[var(--color-border)] p-5">
						<h2 className="m-0 text-base font-semibold">
							{labels.empty.title}
						</h2>
						<p className="m-0 text-sm text-[var(--color-muted)]">
							{labels.empty.body}
						</p>
						<div>
							<Button onClick={openCreate} type="button" variant="secondary">
								{labels.empty.cta}
							</Button>
						</div>
					</div>
				) : (
					<DataTable
						columns={[
							{
								cell: (profile) => (
									<div className="grid gap-1">
										<span className="font-medium text-[var(--color-text)]">
											{profile.productName}
										</span>
										<span className="text-xs text-[var(--color-muted)]">
											{profile.manufacturer}
										</span>
									</div>
								),
								header: labels.fields.name,
								key: "productName",
							},
							{
								cell: (profile) => profile.casNumber ?? "",
								header: labels.fields.casNumber,
								key: "casNumber",
							},
							{
								cell: (profile) => (
									<Badge variant="neutral">
										{labels.profileStatus[profile.profileStatus]}
									</Badge>
								),
								header: labels.filters.label,
								key: "profileStatus",
							},
							{
								cell: (profile) => (
									<StatusBadge
										label={labels.extractionStatus[profile.extractionStatus]}
										size="sm"
										status={statusBadgeState(profile.extractionStatus)}
									/>
								),
								header: labels.sds.currentFile,
								key: "extractionStatus",
							},
							{
								cell: (profile) => String(profile.controlCount),
								header: labels.recap.controls,
								key: "controlCount",
							},
						]}
						data={filteredProfiles}
						labels={{
							empty: labels.empty.title,
							nextPage: labels.actions.add,
							pageStatus: (current, total) => `${current}/${total}`,
							previousPage: labels.actions.close,
						}}
						onRowSelect={openDetail}
						rowKey="id"
					/>
				)}
			</section>

			<InspectorPanel
				isOpen={Boolean(selectedProfile && detailOpen && panelMode === null)}
				onClose={() => setDetailOpen(false)}
				title={selectedProfile?.productName ?? labels.title}
			>
				{selectedProfile ? (
					<ProfileDetail
						labels={labels}
						error={error}
						onArchive={archiveProfile}
						onEdit={() => openEdit(selectedProfile)}
						onExtractSds={() => extractSds(selectedProfile)}
						onReviewSdsControl={(controlId, decision) =>
							reviewSdsControl({
								controlId,
								decision,
								profile: selectedProfile,
							})
						}
						pending={pending}
						profile={selectedProfile}
						sdsFile={sdsFile}
						setSdsFile={setSdsFile}
					/>
				) : null}
			</InspectorPanel>

			<InspectorPanel
				isOpen={panelMode !== null}
				onClose={() => setPanelMode(null)}
				title={
					panelMode === "edit" && selectedProfile
						? selectedProfile.productName
						: labels.actions.add
				}
			>
				<div className="grid gap-4">
					<Input
						label={labels.fields.name}
						onChange={(event) =>
							setFormState((current) => ({
								...current,
								productName: event.currentTarget.value,
							}))
						}
						required
						value={formState.productName}
					/>
					<Input
						label={labels.fields.manufacturer}
						onChange={(event) =>
							setFormState((current) => ({
								...current,
								manufacturer: event.currentTarget.value,
							}))
						}
						required
						value={formState.manufacturer}
					/>
					<div className="grid gap-3 md:grid-cols-2">
						<Input
							label={labels.fields.casNumber}
							onChange={(event) =>
								setFormState((current) => ({
									...current,
									casNumber: event.currentTarget.value,
								}))
							}
							value={formState.casNumber}
						/>
						<Input
							label={labels.fields.unNumber}
							onChange={(event) =>
								setFormState((current) => ({
									...current,
									unNumber: event.currentTarget.value,
								}))
							}
							value={formState.unNumber}
						/>
					</div>
					<Select
						label={labels.filters.label}
						onChange={(value) =>
							setFormState((current) => ({
								...current,
								profileStatus: value as ChemicalProfileStatus,
							}))
						}
						options={(["draft", "active", "archived"] as const).map(
							(value) => ({
								label: labels.profileStatus[value],
								value,
							}),
						)}
						value={formState.profileStatus}
					/>
					{panelMode === "create" ? (
						<Input
							label={labels.fields.storagePath}
							onChange={(event) =>
								setFormState((current) => ({
									...current,
									storagePath: event.currentTarget.value,
								}))
							}
							value={formState.storagePath}
						/>
					) : null}
					{error ? (
						<p className="m-0 text-sm text-[var(--color-accent)]">{error}</p>
					) : null}
					<div className="flex flex-wrap items-center gap-2">
						<Button
							disabled={!formState.productName || !formState.manufacturer}
							loading={pending}
							onClick={saveProfile}
							type="button"
						>
							{labels.actions.save}
						</Button>
						<Button
							onClick={() => setPanelMode(null)}
							type="button"
							variant="secondary"
						>
							{labels.actions.cancel}
						</Button>
					</div>
				</div>
			</InspectorPanel>
		</div>
	);
}

function ProfileDetail({
	labels,
	error,
	onArchive,
	onEdit,
	onExtractSds,
	onReviewSdsControl,
	pending,
	profile,
	sdsFile,
	setSdsFile,
}: {
	labels: ChemicalProfileViewLabels;
	error: string | null;
	onArchive: () => void;
	onEdit: () => void;
	onExtractSds: () => void;
	onReviewSdsControl: (
		controlId: string,
		decision: "approved" | "rejected",
	) => void;
	pending: boolean;
	profile: SerializedChemicalProfileDetail;
	sdsFile: File | null;
	setSdsFile: (file: File | null) => void;
}) {
	return (
		<div className="grid gap-4">
			<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div className="grid gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="m-0 text-lg font-semibold">{profile.productName}</h2>
						<Badge variant="neutral">
							{labels.profileStatus[profile.profileStatus]}
						</Badge>
						<StatusBadge
							label={labels.extractionStatus[profile.extractionStatus]}
							size="sm"
							status={statusBadgeState(profile.extractionStatus)}
						/>
					</div>
					<p className="m-0 text-sm text-[var(--color-muted)]">
						{profile.manufacturer}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button onClick={onEdit} type="button" variant="secondary">
						{labels.actions.save}
					</Button>
					<Button
						disabled={profile.profileStatus === "archived"}
						loading={pending}
						onClick={onArchive}
						type="button"
						variant="destructive"
					>
						{labels.actions.delete}
					</Button>
				</div>
			</div>

			<div className="grid gap-3 md:grid-cols-3">
				<DetailItem label={labels.fields.casNumber} value={profile.casNumber} />
				<DetailItem label={labels.fields.unNumber} value={profile.unNumber} />
				<DetailItem
					label={labels.recap.openReviews}
					value={String(profile.openReviewCount)}
				/>
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				<section className="grid gap-2 rounded-md border border-[var(--color-border)] p-3">
					<h3 className="m-0 text-sm font-medium">{labels.sds.currentFile}</h3>
					{profile.sdsAttachments.length > 0 ? (
						<ul className="m-0 grid gap-2 p-0">
							{profile.sdsAttachments.map((attachment) => (
								<li
									className="list-none rounded border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-muted)]"
									key={attachment.storagePath}
								>
									{attachment.fileName}
								</li>
							))}
						</ul>
					) : (
						<p className="m-0 text-sm text-[var(--color-muted)]">
							{labels.sds.uploadHint}
						</p>
					)}
					<div className="grid gap-3">
						<Input
							accept="text/plain"
							label={labels.sds.uploadLabel}
							onChange={(event) =>
								setSdsFile(event.currentTarget.files?.[0] ?? null)
							}
							type="file"
						/>
						<Button
							disabled={!sdsFile}
							loading={pending}
							onClick={onExtractSds}
							type="button"
							variant="secondary"
						>
							{labels.sds.extractControls}
						</Button>
						{error ? (
							<p className="m-0 text-sm text-[var(--color-accent)]">{error}</p>
						) : null}
					</div>
				</section>

				<section className="grid gap-2 rounded-md border border-[var(--color-border)] p-3">
					<h3 className="m-0 text-sm font-medium">{labels.recap.controls}</h3>
					{profile.controls.length > 0 ? (
						<ul className="m-0 grid gap-2 p-0">
							{profile.controls.map((control) => (
								<li
									className="flex list-none items-center justify-between gap-3 rounded border border-[var(--color-border)] px-3 py-2 text-sm"
									key={control.controlType}
								>
									<span className="text-[var(--color-muted)]">
										{labels.controlTypes[control.controlType]}
									</span>
									<span className="font-medium">{control.count}</span>
								</li>
							))}
						</ul>
					) : (
						<p className="m-0 text-sm text-[var(--color-muted)]">0</p>
					)}
				</section>
			</div>

			<section className="grid gap-3 rounded-md border border-[var(--color-border)] p-3">
				<h3 className="m-0 text-sm font-medium">{labels.sds.reviewQueue}</h3>
				{profile.sdsControls.length > 0 ? (
					<div className="grid gap-3">
						{profile.sdsControls.map((control) => (
							<article
								className="grid gap-2 rounded border border-[var(--color-border)] px-3 py-2 text-sm"
								key={control.id}
							>
								<div className="flex flex-wrap items-start justify-between gap-2">
									<div className="grid gap-1">
										<span className="font-medium text-[var(--color-text)]">
											{labels.controlTypes[control.controlType]}
										</span>
										<span className="text-[var(--color-text)]">
											{control.controlText}
										</span>
									</div>
									<StatusBadge
										label={sdsReviewStatusLabel(control.reviewStatus, labels)}
										size="sm"
										status={sdsReviewBadgeState(control.reviewStatus)}
									/>
								</div>
								<div className="grid gap-2 md:grid-cols-2">
									<DetailItem
										label={labels.sds.section}
										value={control.sdsSection}
									/>
									<DetailItem
										label={labels.sds.confidence}
										value={formatConfidence(control.extractionConfidence)}
									/>
									<DetailItem
										label={labels.sds.model}
										value={control.extractionModelMarker}
									/>
									<DetailItem
										label={labels.sds.status}
										value={sdsReviewStatusLabel(control.reviewStatus, labels)}
									/>
								</div>
								<div className="grid gap-1">
									<span className="text-xs text-[var(--color-muted)]">
										{labels.sds.excerpt}
									</span>
									<p className="m-0 text-sm text-[var(--color-muted)]">
										{control.sourceExcerpt}
									</p>
								</div>
								{control.reviewStatus === "pending" ? (
									<div className="flex flex-wrap gap-2">
										<Button
											disabled={pending}
											onClick={() => onReviewSdsControl(control.id, "approved")}
											type="button"
											variant="secondary"
										>
											{labels.sds.approve}
										</Button>
										<Button
											disabled={pending}
											onClick={() => onReviewSdsControl(control.id, "rejected")}
											type="button"
											variant="destructive"
										>
											{labels.sds.reject}
										</Button>
									</div>
								) : null}
							</article>
						))}
					</div>
				) : (
					<p className="m-0 text-sm text-[var(--color-muted)]">
						{labels.sds.uploadHint}
					</p>
				)}
			</section>
		</div>
	);
}

function DetailItem({ label, value }: { label: string; value: string | null }) {
	return (
		<div className="grid gap-1 rounded-md border border-[var(--color-border)] p-3">
			<span className="text-xs text-[var(--color-muted)]">{label}</span>
			<span className="text-sm font-medium text-[var(--color-text)]">
				{value ?? ""}
			</span>
		</div>
	);
}

function sdsReviewStatusLabel(
	status: SerializedChemicalProfileDetail["sdsControls"][number]["reviewStatus"],
	labels: ChemicalProfileViewLabels,
): string {
	if (status === "approved") {
		return labels.sds.approved;
	}

	if (status === "rejected") {
		return labels.sds.rejected;
	}

	return labels.sds.pendingReview;
}

function sdsReviewBadgeState(
	status: SerializedChemicalProfileDetail["sdsControls"][number]["reviewStatus"],
) {
	if (status === "approved") {
		return "completed";
	}

	if (status === "rejected") {
		return "open";
	}

	return "in-progress";
}

function formatConfidence(value: number | null): string {
	return value === null ? "" : `${Math.round(value * 100)}%`;
}

function filterProfiles(
	profiles: readonly SerializedChemicalProfileDetail[],
	search: string,
	statusFilter: ChemicalProfileStatus | "all",
) {
	const query = search.trim().toLowerCase();

	return profiles.filter((profile) => {
		const matchesStatus =
			statusFilter === "all" || profile.profileStatus === statusFilter;
		const matchesSearch =
			!query ||
			profile.productName.toLowerCase().includes(query) ||
			profile.manufacturer.toLowerCase().includes(query) ||
			(profile.casNumber?.toLowerCase().includes(query) ?? false);

		return matchesStatus && matchesSearch;
	});
}

function statusBadgeState(status: ChemicalExtractionStatus) {
	if (status === "approved") {
		return "completed";
	}

	if (status === "none") {
		return "open";
	}

	return "in-progress";
}

function selectedInitialProfileId(
	profiles: readonly SerializedChemicalProfileDetail[],
	profileId: string | null | undefined,
): string | null {
	if (!profileId) {
		return null;
	}

	return profiles.some((profile) => profile.id === profileId)
		? profileId
		: null;
}

async function submitProfile({
	formState,
	id,
	method,
}: {
	formState: ChemicalProfileFormState;
	id: string | null | undefined;
	method: "PATCH" | "POST";
}): Promise<SerializedChemicalProfileDetail> {
	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
	const payload = {
		casNumber: formState.casNumber,
		manufacturer: formState.manufacturer,
		productName: formState.productName,
		profileStatus: formState.profileStatus,
		unNumber: formState.unNumber,
		...(method === "POST" ? { storagePath: formState.storagePath } : {}),
	};
	const response = await fetch(id ? `/api/chemicals/${id}` : "/api/chemicals", {
		body: JSON.stringify(payload),
		credentials: "same-origin",
		headers: {
			"Content-Type": "application/json",
			"x-safetysecretary-csrf": csrfToken,
		},
		method,
	});

	if (!response.ok) {
		throw new Error("CHEMICAL_PROFILE_SAVE_FAILED");
	}

	const body = (await response.json()) as {
		profile?: SerializedChemicalProfileDetail;
	};

	if (!body.profile) {
		throw new Error("CHEMICAL_PROFILE_SAVE_FAILED");
	}

	return body.profile;
}

async function submitArchive(
	id: string,
): Promise<SerializedChemicalProfileDetail> {
	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
	const response = await fetch(`/api/chemicals/${id}`, {
		credentials: "same-origin",
		headers: {
			"x-safetysecretary-csrf": csrfToken,
		},
		method: "DELETE",
	});

	if (!response.ok) {
		throw new Error("CHEMICAL_PROFILE_ARCHIVE_FAILED");
	}

	const body = (await response.json()) as {
		profile?: SerializedChemicalProfileDetail;
	};

	if (!body.profile) {
		throw new Error("CHEMICAL_PROFILE_ARCHIVE_FAILED");
	}

	return body.profile;
}

async function submitSdsExtraction(input: {
	file: File;
	profileId: string;
}): Promise<SerializedChemicalProfileDetail> {
	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
	const formData = new FormData();
	formData.append("file", input.file);

	const response = await fetch(`/api/chemicals/${input.profileId}/sds`, {
		body: formData,
		credentials: "same-origin",
		headers: {
			"x-safetysecretary-csrf": csrfToken,
		},
		method: "POST",
	});

	if (!response.ok) {
		throw new Error("CHEMICAL_SDS_EXTRACTION_FAILED");
	}

	const body = (await response.json()) as {
		profile?: SerializedChemicalProfileDetail;
	};

	if (!body.profile) {
		throw new Error("CHEMICAL_SDS_EXTRACTION_FAILED");
	}

	return body.profile;
}

async function submitSdsReview(input: {
	controlId: string;
	decision: "approved" | "rejected";
	profileId: string;
}): Promise<SerializedChemicalProfileDetail> {
	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
	const response = await fetch(`/api/chemicals/${input.profileId}/sds`, {
		body: JSON.stringify({
			controlId: input.controlId,
			decision: input.decision,
		}),
		credentials: "same-origin",
		headers: {
			"Content-Type": "application/json",
			"x-safetysecretary-csrf": csrfToken,
		},
		method: "PATCH",
	});

	if (!response.ok) {
		throw new Error("CHEMICAL_SDS_REVIEW_FAILED");
	}

	const body = (await response.json()) as {
		profile?: SerializedChemicalProfileDetail;
	};

	if (!body.profile) {
		throw new Error("CHEMICAL_SDS_REVIEW_FAILED");
	}

	return body.profile;
}
