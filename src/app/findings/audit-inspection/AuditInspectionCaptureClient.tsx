"use client";

import { type FormEvent, useEffect, useState } from "react";
import MobileCaptureLayout from "../../../components/layout/MobileCaptureLayout";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Textarea from "../../../components/ui/Textarea";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import { ensureCsrfToken } from "../../../lib/auth/csrf-client";

type CaptureType = "audit" | "inspection";
type ChecklistResult =
	| "checked_ok"
	| "non_conformance"
	| "not_checked"
	| "positive_observation";
type Severity = "critical" | "high" | "low" | "medium";

export type AuditInspectionCaptureLabels = {
	readonly actionDueDate: string;
	readonly actionOwner: string;
	readonly actionTitle: string;
	readonly addItem: string;
	readonly audit: string;
	readonly captureButton: string;
	readonly checklistTitle: string;
	readonly clearDraft: string;
	readonly createAction: string;
	readonly department: string;
	readonly draftCleared: string;
	readonly draftSaved: string;
	readonly error: string;
	readonly findingType: string;
	readonly findingsCreated: string;
	readonly inspection: string;
	readonly itemDescription: string;
	readonly itemLabel: string;
	readonly itemPrompt: string;
	readonly itemResult: string;
	readonly location: string;
	readonly meta: string;
	readonly noFindingsCreated: string;
	readonly nonPunitiveContext: string;
	readonly note: string;
	readonly photo: string;
	readonly quickAction: string;
	readonly removeItem: string;
	readonly resultCheckedOk: string;
	readonly resultNonConformance: string;
	readonly resultNotChecked: string;
	readonly resultPositiveObservation: string;
	readonly saveDraft: string;
	readonly severity: string;
	readonly severityCritical: string;
	readonly severityHigh: string;
	readonly severityLow: string;
	readonly severityMedium: string;
	readonly success: string;
	readonly title: string;
	readonly viewAction: string;
	readonly workAsDone: string;
};

type AuditInspectionCaptureClientProps = {
	readonly draftStorageKey: string;
	readonly labels: AuditInspectionCaptureLabels;
};

type ChecklistItemState = {
	readonly actionDueDate: string;
	readonly actionOwnerText: string;
	readonly actionTitle: string;
	readonly createAction: boolean;
	readonly description: string;
	readonly id: string;
	readonly prompt: string;
	readonly result: ChecklistResult;
	readonly severity: Severity;
	readonly workAsDoneContext: string;
};

type DraftState = {
	readonly checklistTitle: string;
	readonly contextText: string;
	readonly departmentText: string;
	readonly findingType: CaptureType;
	readonly items: readonly ChecklistItemState[];
	readonly locationText: string;
};

type CaptureResult = {
	readonly findings: readonly {
		readonly action: { readonly id: string; readonly title: string } | null;
		readonly finding: { readonly id: string };
		readonly itemIndex: number;
	}[];
};

const formId = "audit-inspection-capture-form";
const fieldClassName =
	"grid gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3";
const labelClassName = "grid gap-1.5 text-sm text-[var(--color-text)]";
const selectClassName =
	"min-h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";

export default function AuditInspectionCaptureClient({
	draftStorageKey,
	labels,
}: AuditInspectionCaptureClientProps) {
	const [findingType, setFindingType] = useState<CaptureType>("audit");
	const [checklistTitle, setChecklistTitle] = useState("");
	const [departmentText, setDepartmentText] = useState("");
	const [locationText, setLocationText] = useState("");
	const [contextText, setContextText] = useState("");
	const [items, setItems] = useState<ChecklistItemState[]>([
		createChecklistItem("item-0"),
	]);
	const [pending, setPending] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<CaptureResult | null>(null);

	useEffect(() => {
		const draft = loadDraft(draftStorageKey);

		if (!draft) {
			setFindingType("audit");
			setChecklistTitle("");
			setDepartmentText("");
			setLocationText("");
			setContextText("");
			setItems([createChecklistItem("item-0")]);
			return;
		}

		setFindingType(draft.findingType);
		setChecklistTitle(draft.checklistTitle);
		setDepartmentText(draft.departmentText);
		setLocationText(draft.locationText);
		setContextText(draft.contextText);
		setItems(
			draft.items.length > 0
				? [...draft.items]
				: [createChecklistItem("item-0")],
		);
	}, [draftStorageKey]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		const formData = new FormData(form);
		setPending(true);
		setError(null);
		setNotice(null);
		setResult(null);

		try {
			const response = await fetch("/api/findings/audit-inspection", {
				body: formData,
				credentials: "same-origin",
				headers: {
					"x-safetysecretary-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
				},
				method: "POST",
			});

			if (!response.ok) {
				throw new Error("AUDIT_INSPECTION_CAPTURE_FAILED");
			}

			const body = (await response.json()) as CaptureResult;
			setResult(body);
			clearSavedDraft(draftStorageKey);
			resetFormState();
			form.reset();
		} catch {
			setError(labels.error);
		} finally {
			setPending(false);
		}
	}

	function saveDraft() {
		writeDraft(draftStorageKey, {
			checklistTitle,
			contextText,
			departmentText,
			findingType,
			items,
			locationText,
		});
		setNotice(labels.draftSaved);
		setError(null);
	}

	function clearDraft() {
		clearSavedDraft(draftStorageKey);
		resetFormState();
		setNotice(labels.draftCleared);
		setError(null);
		setResult(null);
	}

	function resetFormState() {
		setFindingType("audit");
		setChecklistTitle("");
		setDepartmentText("");
		setLocationText("");
		setContextText("");
		setItems([createChecklistItem("item-0")]);
	}

	function updateItem(
		itemId: string,
		patch: Partial<Omit<ChecklistItemState, "id">>,
	) {
		setItems((current) =>
			current.map((item) =>
				item.id === itemId ? { ...item, ...patch } : item,
			),
		);
	}

	function addItem() {
		setItems((current) => [...current, createChecklistItem()]);
	}

	function removeItem(itemId: string) {
		setItems((current) =>
			current.length > 1
				? current.filter((item) => item.id !== itemId)
				: current,
		);
	}

	const actionLinks = result?.findings.flatMap((item) =>
		item.action ? [item.action] : [],
	);

	return (
		<MobileCaptureLayout
			aria-label={labels.title}
			actions={
				<>
					<Button
						disabled={pending}
						onClick={saveDraft}
						type="button"
						variant="secondary"
					>
						{labels.saveDraft}
					</Button>
					<Button
						disabled={pending}
						form={formId}
						loading={pending}
						type="submit"
					>
						{labels.captureButton}
					</Button>
				</>
			}
			headerAction={
				<Button
					disabled={pending}
					onClick={clearDraft}
					size="sm"
					type="button"
					variant="ghost"
				>
					{labels.clearDraft}
				</Button>
			}
			meta={labels.meta}
			title={labels.title}
		>
			<div className="grid gap-4">
				{result ? (
					<div
						className="grid gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
						role="status"
					>
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="success">{labels.success}</Badge>
							<span className="text-sm text-[var(--color-muted)]">
								{result.findings.length > 0
									? `${result.findings.length} ${labels.findingsCreated}`
									: labels.noFindingsCreated}
							</span>
						</div>
						{actionLinks && actionLinks.length > 0 ? (
							<div className="grid gap-1">
								{actionLinks.map((action) => (
									<a
										className="text-sm font-medium text-[var(--color-text)] underline decoration-[var(--color-accent)] underline-offset-4"
										href={`/workspace/actions/${action.id}`}
										key={action.id}
									>
										{labels.viewAction}: {action.title}
									</a>
								))}
							</div>
						) : null}
					</div>
				) : null}

				{notice ? (
					<p className="m-0 text-sm text-[var(--color-muted)]" role="status">
						{notice}
					</p>
				) : null}

				{error ? (
					<p className="m-0 text-sm text-[var(--color-accent)]" role="alert">
						{error}
					</p>
				) : null}

				<form
					className="grid gap-4"
					encType="multipart/form-data"
					id={formId}
					onSubmit={handleSubmit}
				>
					<input name="itemCount" type="hidden" value={items.length} />
					<section className={fieldClassName}>
						<p className="m-0 text-sm text-[var(--color-muted)]">
							{labels.note}
						</p>
						<label className={labelClassName}>
							<span className="font-medium">{labels.findingType}</span>
							<select
								className={selectClassName}
								name="findingType"
								onChange={(event) =>
									setFindingType(event.currentTarget.value as CaptureType)
								}
								value={findingType}
							>
								<option value="audit">{labels.audit}</option>
								<option value="inspection">{labels.inspection}</option>
							</select>
						</label>
						<Input
							label={labels.checklistTitle}
							name="checklistTitle"
							onChange={(event) => setChecklistTitle(event.currentTarget.value)}
							type="text"
							value={checklistTitle}
						/>
						<div className="grid gap-3 sm:grid-cols-2">
							<Input
								label={labels.location}
								name="locationText"
								onChange={(event) => setLocationText(event.currentTarget.value)}
								type="text"
								value={locationText}
							/>
							<Input
								label={labels.department}
								name="departmentText"
								onChange={(event) =>
									setDepartmentText(event.currentTarget.value)
								}
								type="text"
								value={departmentText}
							/>
						</div>
						<Textarea
							label={labels.nonPunitiveContext}
							name="contextText"
							onChange={(event) => setContextText(event.currentTarget.value)}
							rows={3}
							value={contextText}
						/>
					</section>

					<div className="grid gap-4">
						{items.map((item, index) => (
							<section className={fieldClassName} key={item.id}>
								<div className="flex items-center justify-between gap-3">
									<h2 className="m-0 text-sm font-semibold text-[var(--color-text)]">
										{labels.itemLabel} {index + 1}
									</h2>
									<Button
										disabled={items.length < 2 || pending}
										onClick={() => removeItem(item.id)}
										size="sm"
										type="button"
										variant="ghost"
									>
										{labels.removeItem}
									</Button>
								</div>
								<Input
									label={labels.itemPrompt}
									name={itemName(index, "prompt")}
									onChange={(event) =>
										updateItem(item.id, { prompt: event.currentTarget.value })
									}
									required
									type="text"
									value={item.prompt}
								/>
								<div className="grid gap-3 sm:grid-cols-2">
									<label className={labelClassName}>
										<span className="font-medium">{labels.itemResult}</span>
										<select
											className={selectClassName}
											name={itemName(index, "result")}
											onChange={(event) =>
												updateItem(item.id, {
													result: event.currentTarget.value as ChecklistResult,
												})
											}
											value={item.result}
										>
											<option value="not_checked">
												{labels.resultNotChecked}
											</option>
											<option value="checked_ok">
												{labels.resultCheckedOk}
											</option>
											<option value="non_conformance">
												{labels.resultNonConformance}
											</option>
											<option value="positive_observation">
												{labels.resultPositiveObservation}
											</option>
										</select>
									</label>
									<label className={labelClassName}>
										<span className="font-medium">{labels.severity}</span>
										<select
											className={selectClassName}
											name={itemName(index, "severity")}
											onChange={(event) =>
												updateItem(item.id, {
													severity: event.currentTarget.value as Severity,
												})
											}
											value={item.severity}
										>
											<option value="low">{labels.severityLow}</option>
											<option value="medium">{labels.severityMedium}</option>
											<option value="high">{labels.severityHigh}</option>
											<option value="critical">
												{labels.severityCritical}
											</option>
										</select>
									</label>
								</div>
								<Textarea
									label={labels.itemDescription}
									name={itemName(index, "description")}
									onChange={(event) =>
										updateItem(item.id, {
											description: event.currentTarget.value,
										})
									}
									rows={3}
									value={item.description}
								/>
								<Input
									accept="image/png,image/jpeg"
									label={labels.photo}
									name={itemName(index, "photo")}
									type="file"
								/>
								<Textarea
									label={labels.workAsDone}
									name={itemName(index, "workAsDoneContext")}
									onChange={(event) =>
										updateItem(item.id, {
											workAsDoneContext: event.currentTarget.value,
										})
									}
									rows={3}
									value={item.workAsDoneContext}
								/>
								<label className="grid grid-cols-[1.25rem_1fr] gap-3 text-sm text-[var(--color-text)]">
									<input
										checked={item.createAction}
										className="mt-1 h-4 w-4"
										name={itemName(index, "createAction")}
										onChange={(event) =>
											updateItem(item.id, {
												createAction: event.currentTarget.checked,
											})
										}
										type="checkbox"
									/>
									<span>{labels.createAction}</span>
								</label>
								{item.createAction ? (
									<div className="grid gap-3">
										<p className="m-0 text-sm text-[var(--color-muted)]">
											{labels.quickAction}
										</p>
										<Input
											label={labels.actionTitle}
											name={itemName(index, "actionTitle")}
											onChange={(event) =>
												updateItem(item.id, {
													actionTitle: event.currentTarget.value,
												})
											}
											type="text"
											value={item.actionTitle}
										/>
										<div className="grid gap-3 sm:grid-cols-2">
											<Input
												label={labels.actionOwner}
												name={itemName(index, "actionOwnerText")}
												onChange={(event) =>
													updateItem(item.id, {
														actionOwnerText: event.currentTarget.value,
													})
												}
												type="text"
												value={item.actionOwnerText}
											/>
											<Input
												label={labels.actionDueDate}
												name={itemName(index, "actionDueDate")}
												onChange={(event) =>
													updateItem(item.id, {
														actionDueDate: event.currentTarget.value,
													})
												}
												type="date"
												value={item.actionDueDate}
											/>
										</div>
									</div>
								) : null}
							</section>
						))}
					</div>

					<Button onClick={addItem} type="button" variant="secondary">
						{labels.addItem}
					</Button>
				</form>
			</div>
		</MobileCaptureLayout>
	);
}

function createChecklistItem(id = createItemId()): ChecklistItemState {
	return {
		actionDueDate: "",
		actionOwnerText: "",
		actionTitle: "",
		createAction: false,
		description: "",
		id,
		prompt: "",
		result: "not_checked",
		severity: "medium",
		workAsDoneContext: "",
	};
}

function createItemId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}`;
}

function itemName(index: number, field: string): string {
	return ["items", String(index), field].join(".");
}

function loadDraft(draftStorageKey: string): DraftState | null {
	if (typeof window === "undefined") {
		return null;
	}

	const raw = window.localStorage.getItem(draftStorageKey);
	if (!raw) {
		return null;
	}

	try {
		return normalizeDraft(JSON.parse(raw));
	} catch {
		return null;
	}
}

function writeDraft(draftStorageKey: string, draft: DraftState): void {
	if (typeof window === "undefined") {
		return;
	}

	window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
}

function clearSavedDraft(draftStorageKey: string): void {
	if (typeof window === "undefined") {
		return;
	}

	window.localStorage.removeItem(draftStorageKey);
}

function normalizeDraft(value: unknown): DraftState | null {
	if (!isRecord(value)) {
		return null;
	}

	const findingType =
		value.findingType === "inspection" || value.findingType === "audit"
			? value.findingType
			: "audit";
	const items = Array.isArray(value.items)
		? value.items.flatMap((item) => {
				const normalized = normalizeDraftItem(item);
				return normalized ? [normalized] : [];
			})
		: [];

	return {
		checklistTitle: stringDraftValue(value.checklistTitle),
		contextText: stringDraftValue(value.contextText),
		departmentText: stringDraftValue(value.departmentText),
		findingType,
		items,
		locationText: stringDraftValue(value.locationText),
	};
}

function normalizeDraftItem(value: unknown): ChecklistItemState | null {
	if (!isRecord(value)) {
		return null;
	}

	return {
		actionDueDate: stringDraftValue(value.actionDueDate),
		actionOwnerText: stringDraftValue(value.actionOwnerText),
		actionTitle: stringDraftValue(value.actionTitle),
		createAction: value.createAction === true,
		description: stringDraftValue(value.description),
		id: stringDraftValue(value.id) || createItemId(),
		prompt: stringDraftValue(value.prompt),
		result: normalizeResult(value.result),
		severity: normalizeSeverity(value.severity),
		workAsDoneContext: stringDraftValue(value.workAsDoneContext),
	};
}

function normalizeResult(value: unknown): ChecklistResult {
	if (
		value === "checked_ok" ||
		value === "non_conformance" ||
		value === "positive_observation"
	) {
		return value;
	}

	return "not_checked";
}

function normalizeSeverity(value: unknown): Severity {
	if (
		value === "critical" ||
		value === "high" ||
		value === "low" ||
		value === "medium"
	) {
		return value;
	}

	return "medium";
}

function stringDraftValue(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
