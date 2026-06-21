"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import Textarea from "../../../components/ui/Textarea";
import type {
	ActionItemEffectivenessResult,
	ActionItemOriginType,
	ActionItemPriority,
	ActionItemStatus,
	ActionItemVerificationStatus,
} from "../../../lib/actions/action-item";
import type { SerializedActionAttachmentRow } from "../../../lib/actions/attachments";
import type { FINDINGS_WITHOUT_ACTION_SOURCE_QUEUE } from "../../../lib/actions/finding-queue";
import {
	ACTION_BOARD_ACTION_ORIGIN_LABEL_KEYS,
	ACTION_BOARD_EFFECTIVENESS_LABEL_KEYS,
	ACTION_BOARD_PRIORITY_LABEL_KEYS,
	ACTION_BOARD_STATUS_LABEL_KEYS,
	ACTION_BOARD_VERIFICATION_LABEL_KEYS,
	type actionBoardLabels,
} from "../../../lib/actions/fixtures";
import type { SerializedActionItemDetail } from "../../../lib/actions/queries";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
import { t } from "../../../lib/i18n/t";
import type { Locale } from "../../../lib/i18n/types";

type ActionFormMode = "create" | "edit";

type ActionFormClientProps = {
	readonly focus?: string | null;
	readonly initialAction: ActionFormState;
	readonly labels: ReturnType<typeof actionBoardLabels>;
	readonly locale: Locale;
	readonly mode: ActionFormMode;
};

export type ActionFormState = {
	readonly id: string | null;
	readonly title: string;
	readonly description: string;
	readonly status: ActionItemStatus;
	readonly dueDate: string;
	readonly assigneeUserId: string;
	readonly ownerText: string;
	readonly departmentText: string;
	readonly originType: ActionItemOriginType;
	readonly originId: string;
	readonly originLabel: string;
	readonly originCreatedAt: string;
	readonly priority: ActionItemPriority;
	readonly isSafetyCritical: boolean;
	readonly sourceQueue: "" | typeof FINDINGS_WITHOUT_ACTION_SOURCE_QUEUE;
	readonly verificationStatus: ActionItemVerificationStatus;
	readonly verificationNote: string;
	readonly verifiedAt: string;
	readonly verifiedByUserId: string;
	readonly effectivenessResult: ActionItemEffectivenessResult;
	readonly attachments: readonly SerializedActionAttachmentRow[];
};

const statusOptions: readonly ActionItemStatus[] = [
	"open",
	"in_progress",
	"completed",
	"cancelled",
];
const priorityOptions: readonly ActionItemPriority[] = [
	"low",
	"medium",
	"high",
	"critical",
];
const verificationOptions: readonly ActionItemVerificationStatus[] = [
	"not_required",
	"needed",
	"verified",
	"needs_follow_up",
];
const effectivenessOptions: readonly ActionItemEffectivenessResult[] = [
	"unknown",
	"effective",
	"needs_follow_up",
];
const createOriginOptions: readonly ActionItemOriginType[] = [
	"manual",
	"meeting",
	"toolbox_talk",
];

export default function ActionFormClient({
	focus,
	initialAction,
	labels,
	locale,
	mode,
}: ActionFormClientProps) {
	const router = useRouter();
	const [formState, setFormState] = useState<ActionFormState>(initialAction);
	const [attachments, setAttachments] = useState([
		...initialAction.attachments,
	]);
	const [attachmentDescription, setAttachmentDescription] = useState("");
	const [pending, setPending] = useState(false);
	const [attachmentPending, setAttachmentPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isSourceBackedCreate = mode === "create" && Boolean(formState.originId);
	const needsFollowUp = useMemo(
		() =>
			formState.verificationStatus === "needs_follow_up" ||
			formState.effectivenessResult === "needs_follow_up",
		[formState.effectivenessResult, formState.verificationStatus],
	);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		setError(null);

		try {
			const saved = await submitAction(mode, formState);
			setFormState(actionToFormState(saved));
			setAttachments([...saved.attachments]);

			if (mode === "create") {
				router.push(`/workspace/actions/${saved.id}`);
			} else {
				router.refresh();
			}
		} catch {
			setError(labels.form.saveFailed);
		} finally {
			setPending(false);
		}
	}

	async function handleDelete() {
		if (!formState.id) {
			return;
		}

		setPending(true);
		setError(null);

		try {
			const saved = await deleteAction(formState.id);
			setFormState(actionToFormState(saved));
			router.refresh();
		} catch {
			setError(labels.form.saveFailed);
		} finally {
			setPending(false);
		}
	}

	async function handleReopen() {
		if (!formState.id) {
			return;
		}

		setPending(true);
		setError(null);

		try {
			const saved = await submitAction("edit", {
				...formState,
				status: "in_progress",
			});
			setFormState(actionToFormState(saved));
			router.refresh();
		} catch {
			setError(labels.form.saveFailed);
		} finally {
			setPending(false);
		}
	}

	async function handleAttachmentSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!formState.id) {
			return;
		}

		const form = event.currentTarget;
		const data = new FormData(form);
		setAttachmentPending(true);
		setError(null);

		try {
			const attachment = await uploadAttachment(formState.id, data);
			setAttachments((current) => [...current, attachment]);
			setAttachmentDescription("");
			form.reset();
		} catch {
			setError(labels.form.uploadFailed);
		} finally {
			setAttachmentPending(false);
		}
	}

	async function handleAttachmentRemove(attachmentId: string) {
		if (!formState.id) {
			return;
		}

		setAttachmentPending(true);
		setError(null);

		try {
			await removeAttachment(formState.id, attachmentId);
			setAttachments((current) =>
				current.filter((attachment) => attachment.id !== attachmentId),
			);
		} catch {
			setError(labels.form.removeFailed);
		} finally {
			setAttachmentPending(false);
		}
	}

	return (
		<div className="grid gap-4">
			<header className="grid gap-2">
				<a
					className="text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-text)]"
					href="/workspace/actions"
				>
					{labels.form.backToBoard}
				</a>
				<h1 className="m-0 text-xl font-semibold">
					{mode === "create" ? labels.form.createTitle : labels.form.editTitle}
				</h1>
				<p className="m-0 max-w-3xl text-sm text-[var(--color-muted)]">
					{mode === "create"
						? labels.form.createDescription
						: labels.form.editDescription}
				</p>
			</header>

			{needsFollowUp ? (
				<section className="grid gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="warning">{labels.form.followUpTitle}</Badge>
						<span className="text-sm text-[var(--color-muted)]">
							{labels.form.followUpBody}
						</span>
					</div>
					<div className="flex flex-wrap gap-2">
						{formState.id ? (
							<a
								className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elev)]"
								href={`/workspace/actions/new?followUpFrom=${formState.id}`}
							>
								{labels.form.createFollowUp}
							</a>
						) : null}
						<Button
							disabled={!formState.id || pending}
							onClick={handleReopen}
							type="button"
							variant="secondary"
						>
							{labels.form.reopenAction}
						</Button>
					</div>
				</section>
			) : null}

			<form className="grid gap-4" onSubmit={handleSubmit}>
				<section className="grid gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
					<h2 className="m-0 text-base font-semibold">
						{labels.form.mutableFields}
					</h2>
					<div className="grid gap-3 md:grid-cols-2">
						<Input
							label={labels.fields.title}
							onChange={(event) =>
								setFormState((current) => ({
									...current,
									title: event.currentTarget.value,
								}))
							}
							readOnly={mode === "edit"}
							required
							value={formState.title}
						/>
						<Select
							label={labels.fields.status}
							onChange={(value) =>
								setFormState((current) => ({
									...current,
									status: value as ActionItemStatus,
								}))
							}
							options={statusOptions.map((status) => ({
								label: t(ACTION_BOARD_STATUS_LABEL_KEYS[status], locale),
								value: status,
							}))}
							value={formState.status}
						/>
						<Input
							label={labels.fields.dueDate}
							onChange={(event) =>
								setFormState((current) => ({
									...current,
									dueDate: event.currentTarget.value,
								}))
							}
							type="date"
							value={formState.dueDate}
						/>
						<Select
							label={labels.fields.priority}
							onChange={(value) =>
								setFormState((current) => ({
									...current,
									priority: value as ActionItemPriority,
								}))
							}
							options={priorityOptions.map((priority) => ({
								label: t(ACTION_BOARD_PRIORITY_LABEL_KEYS[priority], locale),
								value: priority,
							}))}
							value={formState.priority}
						/>
						<Input
							label={labels.fields.assignee}
							onChange={(event) =>
								setFormState((current) => ({
									...current,
									assigneeUserId: event.currentTarget.value,
								}))
							}
							value={formState.assigneeUserId}
						/>
						<Input
							label={labels.filters.assignee}
							onChange={(event) =>
								setFormState((current) => ({
									...current,
									ownerText: event.currentTarget.value,
								}))
							}
							value={formState.ownerText}
						/>
						<Input
							label={labels.fields.department}
							onChange={(event) =>
								setFormState((current) => ({
									...current,
									departmentText: event.currentTarget.value,
								}))
							}
							value={formState.departmentText}
						/>
					</div>
					<Textarea
						label={labels.fields.description}
						onChange={(event) =>
							setFormState((current) => ({
								...current,
								description: event.currentTarget.value,
							}))
						}
						value={formState.description}
					/>
				</section>

				<section className="grid gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
					<h2 className="m-0 text-base font-semibold">
						{labels.form.originFields}
					</h2>
					<div className="grid gap-3 md:grid-cols-2">
						{mode === "create" && !isSourceBackedCreate ? (
							<Select
								label={labels.fields.origin}
								onChange={(value) =>
									setFormState((current) => ({
										...current,
										originType: value as ActionItemOriginType,
									}))
								}
								options={createOriginOptions.map((originType) => ({
									label: t(
										ACTION_BOARD_ACTION_ORIGIN_LABEL_KEYS[originType],
										locale,
									),
									value: originType,
								}))}
								value={formState.originType}
							/>
						) : (
							<ReadOnlyField
								label={labels.fields.origin}
								value={t(
									ACTION_BOARD_ACTION_ORIGIN_LABEL_KEYS[formState.originType],
									locale,
								)}
							/>
						)}
						<ReadOnlyField
							label={labels.fields.originId}
							value={formState.originId}
						/>
						<Input
							label={labels.fields.originLabel}
							onChange={(event) =>
								setFormState((current) => ({
									...current,
									originLabel: event.currentTarget.value,
								}))
							}
							readOnly={formState.originType !== "manual"}
							value={formState.originLabel}
						/>
						<ReadOnlyField
							label={labels.fields.originCreatedAt}
							value={formState.originCreatedAt}
						/>
					</div>
					<p className="m-0 text-sm text-[var(--color-muted)]">
						{labels.form.manualOriginHelp}
					</p>
				</section>

				<section
					className="grid gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
					id={focus === "closure" ? "closure" : undefined}
				>
					<h2 className="m-0 text-base font-semibold">
						{labels.form.closureFields}
					</h2>
					<label className="grid grid-cols-[1.25rem_1fr] gap-3 text-sm text-[var(--color-text)]">
						<input
							checked={formState.isSafetyCritical}
							className="mt-1 h-4 w-4"
							onChange={(event) =>
								setFormState((current) => ({
									...current,
									isSafetyCritical: event.currentTarget.checked,
								}))
							}
							type="checkbox"
						/>
						<span>{labels.fields.isSafetyCritical}</span>
					</label>
					<div className="grid gap-3 md:grid-cols-2">
						<Select
							label={labels.fields.verificationStatus}
							onChange={(value) =>
								setFormState((current) => ({
									...current,
									verificationStatus: value as ActionItemVerificationStatus,
								}))
							}
							options={verificationOptions.map((status) => ({
								label: t(ACTION_BOARD_VERIFICATION_LABEL_KEYS[status], locale),
								value: status,
							}))}
							value={formState.verificationStatus}
						/>
						<Select
							label={labels.fields.effectiveness}
							onChange={(value) =>
								setFormState((current) => ({
									...current,
									effectivenessResult: value as ActionItemEffectivenessResult,
								}))
							}
							options={effectivenessOptions.map((result) => ({
								label: t(ACTION_BOARD_EFFECTIVENESS_LABEL_KEYS[result], locale),
								value: result,
							}))}
							value={formState.effectivenessResult}
						/>
						<Input
							label={labels.fields.verifiedAt}
							onChange={(event) =>
								setFormState((current) => ({
									...current,
									verifiedAt: event.currentTarget.value,
								}))
							}
							type="datetime-local"
							value={formState.verifiedAt}
						/>
						<Input
							label={labels.fields.verifiedBy}
							onChange={(event) =>
								setFormState((current) => ({
									...current,
									verifiedByUserId: event.currentTarget.value,
								}))
							}
							value={formState.verifiedByUserId}
						/>
					</div>
					<Textarea
						label={labels.fields.verificationNote}
						onChange={(event) =>
							setFormState((current) => ({
								...current,
								verificationNote: event.currentTarget.value,
							}))
						}
						value={formState.verificationNote}
					/>
					{formState.isSafetyCritical && formState.status === "completed" ? (
						<p className="m-0 text-sm text-[var(--color-muted)]">
							{labels.form.statusOnlyBlocked}
						</p>
					) : null}
				</section>

				{error ? (
					<p className="m-0 text-sm text-[var(--color-accent)]" role="alert">
						{error}
					</p>
				) : null}

				<div className="flex flex-wrap gap-2">
					<Button disabled={pending} loading={pending} type="submit">
						{mode === "create"
							? t("action.add", locale)
							: t("action.save", locale)}
					</Button>
					{mode === "edit" ? (
						<Button
							disabled={pending}
							onClick={handleDelete}
							type="button"
							variant="destructive"
						>
							{labels.detail.closeAction}
						</Button>
					) : null}
				</div>
			</form>

			{mode === "edit" && formState.id ? (
				<section
					className="grid gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
					id={focus === "attachments" ? "attachments" : undefined}
				>
					<h2 className="m-0 text-base font-semibold">
						{labels.form.attachmentsTitle}
					</h2>
					{attachments.length === 0 ? (
						<p className="m-0 text-sm text-[var(--color-muted)]">
							{labels.form.noAttachments}
						</p>
					) : (
						<ul className="m-0 grid list-none gap-2 p-0">
							{attachments.map((attachment) => (
								<li
									className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-border)] p-3"
									key={attachment.id}
								>
									<div className="grid gap-1">
										<span className="text-sm font-medium">
											{attachment.filename}
										</span>
										<span className="text-xs text-[var(--color-muted)]">
											{attachment.description ?? attachment.mimeType}
										</span>
									</div>
									<Button
										disabled={attachmentPending}
										onClick={() => handleAttachmentRemove(attachment.id)}
										size="sm"
										type="button"
										variant="ghost"
									>
										{labels.form.removeAttachment}
									</Button>
								</li>
							))}
						</ul>
					)}
					<form className="grid gap-3" onSubmit={handleAttachmentSubmit}>
						<Input
							aria-label={labels.form.attachmentFile}
							name="file"
							required
							type="file"
						/>
						<Input
							label={labels.form.attachmentDescription}
							name="description"
							onChange={(event) =>
								setAttachmentDescription(event.currentTarget.value)
							}
							value={attachmentDescription}
						/>
						<Button
							disabled={attachmentPending}
							loading={attachmentPending}
							type="submit"
							variant="secondary"
						>
							{labels.form.uploadAttachment}
						</Button>
					</form>
				</section>
			) : null}
		</div>
	);
}

export function actionToFormState(
	action: SerializedActionItemDetail,
): ActionFormState {
	return {
		assigneeUserId: action.assigneeUserId ?? "",
		attachments: action.attachments,
		departmentText: action.departmentText ?? "",
		description: action.description ?? "",
		dueDate: action.dueDate ?? "",
		effectivenessResult: action.effectivenessResult,
		id: action.id,
		isSafetyCritical: action.isSafetyCritical,
		originCreatedAt: action.originCreatedAt,
		originId: action.originId ?? "",
		originLabel: action.originLabel,
		originType: action.originType,
		ownerText: action.ownerText ?? "",
		priority: action.priority,
		sourceQueue: "",
		status: action.status,
		title: action.title,
		verificationNote: action.verificationNote ?? "",
		verificationStatus: action.verificationStatus,
		verifiedAt: toDatetimeLocalValue(action.verifiedAt),
		verifiedByUserId: action.verifiedByUserId ?? "",
	};
}

export function emptyActionFormState(
	overrides: Partial<ActionFormState> = {},
): ActionFormState {
	return {
		assigneeUserId: "",
		attachments: [],
		departmentText: "",
		description: "",
		dueDate: "",
		effectivenessResult: "unknown",
		id: null,
		isSafetyCritical: false,
		originCreatedAt: "",
		originId: "",
		originLabel: "",
		originType: "manual",
		ownerText: "",
		priority: "medium",
		sourceQueue: "",
		status: "open",
		title: "",
		verificationNote: "",
		verificationStatus: "not_required",
		verifiedAt: "",
		verifiedByUserId: "",
		...overrides,
	};
}

function ReadOnlyField({
	label,
	value,
}: {
	readonly label: string;
	readonly value: string | null;
}) {
	return (
		<div className="grid gap-1.5">
			<span className="text-xs font-medium text-[var(--color-muted)]">
				{label}
			</span>
			<span className="min-h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2 text-sm text-[var(--color-text)]">
				{value || "-"}
			</span>
		</div>
	);
}

async function submitAction(
	mode: ActionFormMode,
	formState: ActionFormState,
): Promise<SerializedActionItemDetail> {
	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
	const response = await fetch(
		mode === "create" ? "/api/actions" : `/api/actions/${formState.id}`,
		{
			body: JSON.stringify(actionPayload(mode, formState)),
			credentials: "same-origin",
			headers: {
				"Content-Type": "application/json",
				"x-safetysecretary-csrf": csrfToken,
			},
			method: mode === "create" ? "POST" : "PATCH",
		},
	);

	if (!response.ok) {
		throw new Error("ACTION_SAVE_FAILED");
	}

	const body = (await response.json()) as {
		action?: SerializedActionItemDetail;
	};

	if (!body.action) {
		throw new Error("ACTION_SAVE_FAILED");
	}

	return body.action;
}

async function deleteAction(id: string): Promise<SerializedActionItemDetail> {
	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
	const response = await fetch(`/api/actions/${id}`, {
		credentials: "same-origin",
		headers: { "x-safetysecretary-csrf": csrfToken },
		method: "DELETE",
	});

	if (!response.ok) {
		throw new Error("ACTION_DELETE_FAILED");
	}

	const body = (await response.json()) as {
		action?: SerializedActionItemDetail;
	};

	if (!body.action) {
		throw new Error("ACTION_DELETE_FAILED");
	}

	return body.action;
}

async function uploadAttachment(
	actionId: string,
	formData: FormData,
): Promise<SerializedActionAttachmentRow> {
	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
	const response = await fetch(`/api/actions/${actionId}/attachments`, {
		body: formData,
		credentials: "same-origin",
		headers: { "x-safetysecretary-csrf": csrfToken },
		method: "POST",
	});

	if (!response.ok) {
		throw new Error("ACTION_ATTACHMENT_UPLOAD_FAILED");
	}

	const body = (await response.json()) as {
		attachment?: SerializedActionAttachmentRow;
	};

	if (!body.attachment) {
		throw new Error("ACTION_ATTACHMENT_UPLOAD_FAILED");
	}

	return body.attachment;
}

async function removeAttachment(
	actionId: string,
	attachmentId: string,
): Promise<void> {
	const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
	const response = await fetch(`/api/actions/${actionId}/attachments`, {
		body: JSON.stringify({ attachmentId }),
		credentials: "same-origin",
		headers: {
			"Content-Type": "application/json",
			"x-safetysecretary-csrf": csrfToken,
		},
		method: "DELETE",
	});

	if (!response.ok) {
		throw new Error("ACTION_ATTACHMENT_REMOVE_FAILED");
	}
}

function actionPayload(mode: ActionFormMode, formState: ActionFormState) {
	const payload = {
		assigneeUserId: nullWhenBlank(formState.assigneeUserId),
		departmentText: nullWhenBlank(formState.departmentText),
		description: nullWhenBlank(formState.description),
		dueDate: nullWhenBlank(formState.dueDate),
		effectivenessResult: formState.effectivenessResult,
		isSafetyCritical: formState.isSafetyCritical,
		ownerText: nullWhenBlank(formState.ownerText),
		priority: formState.priority,
		status: formState.status,
		verificationNote: nullWhenBlank(formState.verificationNote),
		verificationStatus: formState.verificationStatus,
		verifiedAt: dateTimeValue(formState.verifiedAt),
		verifiedByUserId: nullWhenBlank(formState.verifiedByUserId),
	};

	if (mode === "edit") {
		return {
			...payload,
			...(formState.originType === "manual"
				? { originLabel: nullWhenBlank(formState.originLabel) }
				: {}),
		};
	}

	return {
		...payload,
		originCreatedAt: nullWhenBlank(formState.originCreatedAt),
		originId: nullWhenBlank(formState.originId),
		originLabel: nullWhenBlank(formState.originLabel),
		originType: formState.originType,
		sourceQueue: formState.sourceQueue || null,
		title: formState.title,
	};
}

function nullWhenBlank(value: string): string | null {
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function dateTimeValue(value: string): string | null {
	return value ? new Date(value).toISOString() : null;
}

function toDatetimeLocalValue(value: string | null): string {
	return value ? value.slice(0, 16) : "";
}
