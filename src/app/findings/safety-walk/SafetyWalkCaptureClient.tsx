"use client";

import { type FormEvent, useState } from "react";
import MobileCaptureLayout from "../../../components/layout/MobileCaptureLayout";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Textarea from "../../../components/ui/Textarea";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import { ensureCsrfToken } from "../../../lib/auth/csrf-client";

export type SafetyWalkCaptureLabels = {
	readonly actionDueDate: string;
	readonly actionOwner: string;
	readonly actionTitle: string;
	readonly captureButton: string;
	readonly createAction: string;
	readonly department: string;
	readonly description: string;
	readonly error: string;
	readonly goodCatch: string;
	readonly location: string;
	readonly meta: string;
	readonly noActionCreated: string;
	readonly note: string;
	readonly photo: string;
	readonly quickAction: string;
	readonly requiredHint: string;
	readonly severity: string;
	readonly severityCritical: string;
	readonly severityHigh: string;
	readonly severityLow: string;
	readonly severityMedium: string;
	readonly success: string;
	readonly title: string;
	readonly titleField: string;
	readonly viewAction: string;
	readonly workAsDone: string;
};

type SafetyWalkCaptureClientProps = {
	readonly labels: SafetyWalkCaptureLabels;
};

type CaptureResult = {
	readonly action: { readonly id: string; readonly title: string } | null;
	readonly finding: { readonly id: string };
};

const formId = "safety-walk-capture-form";
const fieldClassName =
	"grid gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3";
const labelClassName = "grid gap-1.5 text-sm text-[var(--color-text)]";
const selectClassName =
	"min-h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";

export default function SafetyWalkCaptureClient({
	labels,
}: SafetyWalkCaptureClientProps) {
	const [createAction, setCreateAction] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<CaptureResult | null>(null);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		const formData = new FormData(form);
		setPending(true);
		setError(null);
		setResult(null);

		try {
			const response = await fetch("/api/findings/safety-walk", {
				body: formData,
				credentials: "same-origin",
				headers: {
					"x-safetysecretary-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
				},
				method: "POST",
			});

			if (!response.ok) {
				throw new Error("SAFETY_WALK_CAPTURE_FAILED");
			}

			const body = (await response.json()) as CaptureResult;
			setResult(body);
			setCreateAction(false);
			form.reset();
		} catch {
			setError(labels.error);
		} finally {
			setPending(false);
		}
	}

	return (
		<MobileCaptureLayout
			aria-label={labels.title}
			actions={
				<Button
					disabled={pending}
					form={formId}
					loading={pending}
					type="submit"
				>
					{labels.captureButton}
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
								{result.action ? result.action.title : labels.noActionCreated}
							</span>
						</div>
						{result.action ? (
							<a
								className="text-sm font-medium text-[var(--color-text)] underline decoration-[var(--color-accent)] underline-offset-4"
								href={`/workspace/actions/${result.action.id}`}
							>
								{labels.viewAction}
							</a>
						) : null}
					</div>
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
					<section className={fieldClassName}>
						<p className="m-0 text-sm text-[var(--color-muted)]">
							{labels.note}
						</p>
						<Textarea
							label={labels.description}
							name="description"
							required
							rows={4}
						/>
						<Input label={labels.titleField} name="title" type="text" />
						<div className="grid gap-3 sm:grid-cols-2">
							<Input label={labels.location} name="locationText" type="text" />
							<Input
								label={labels.department}
								name="departmentText"
								type="text"
							/>
						</div>
						<label className={labelClassName}>
							<span className="font-medium">{labels.severity}</span>
							<select
								className={selectClassName}
								defaultValue="medium"
								name="severity"
							>
								<option value="low">{labels.severityLow}</option>
								<option value="medium">{labels.severityMedium}</option>
								<option value="high">{labels.severityHigh}</option>
								<option value="critical">{labels.severityCritical}</option>
							</select>
						</label>
					</section>

					<section className={fieldClassName}>
						<Input
							accept="image/png,image/jpeg"
							label={labels.photo}
							name="photo"
							type="file"
						/>
						<label className="grid grid-cols-[1.25rem_1fr] gap-3 text-sm text-[var(--color-text)]">
							<input
								className="mt-1 h-4 w-4"
								name="goodCatch"
								type="checkbox"
							/>
							<span>{labels.goodCatch}</span>
						</label>
						<Textarea
							label={labels.workAsDone}
							name="workAsDoneContext"
							rows={3}
						/>
					</section>

					<section className={fieldClassName}>
						<label className="grid grid-cols-[1.25rem_1fr] gap-3 text-sm text-[var(--color-text)]">
							<input
								checked={createAction}
								className="mt-1 h-4 w-4"
								name="createAction"
								onChange={(event) =>
									setCreateAction(event.currentTarget.checked)
								}
								type="checkbox"
							/>
							<span>{labels.createAction}</span>
						</label>
						{createAction ? (
							<div className="grid gap-3">
								<p className="m-0 text-sm text-[var(--color-muted)]">
									{labels.quickAction}
								</p>
								<Input
									label={labels.actionTitle}
									name="actionTitle"
									type="text"
								/>
								<div className="grid gap-3 sm:grid-cols-2">
									<Input
										label={labels.actionOwner}
										name="actionOwnerText"
										type="text"
									/>
									<Input
										label={labels.actionDueDate}
										name="actionDueDate"
										type="date"
									/>
								</div>
							</div>
						) : null}
					</section>

					<p className="m-0 text-xs text-[var(--color-muted)]">
						{labels.requiredHint}
					</p>
				</form>
			</div>
		</MobileCaptureLayout>
	);
}
