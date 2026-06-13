"use client";

import {
	ACTION_BOARD_FIXTURES,
	actionBoardLabels,
	renderActionBoardFixture,
} from "../../../lib/actions/fixtures";
import type { Locale } from "../../../lib/i18n/types";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";

const statusTone = {
	cancelled: "neutral",
	completed: "success",
	in_progress: "info",
	open: "warning",
	overdue: "error",
} as const;

export function ActionBoardFixture({ locale = "en" }: { locale?: Locale }) {
	const labels = actionBoardLabels(locale);
	const openCount = ACTION_BOARD_FIXTURES.filter((action) =>
		["in_progress", "open", "overdue"].includes(action.status),
	).length;
	const overdueCount = ACTION_BOARD_FIXTURES.filter(
		(action) => action.status === "overdue",
	).length;
	const completedCount = ACTION_BOARD_FIXTURES.filter(
		(action) => action.status === "completed",
	).length;

	return (
		<section aria-label={labels.list.title} className="grid gap-4 p-4">
			<header className="grid gap-3">
				<h2 className="m-0 text-lg font-semibold">{labels.list.title}</h2>
				<fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
					<legend className="sr-only">{labels.list.filters}</legend>
					<Badge variant="neutral">{labels.filters.status}</Badge>
					<Badge variant="neutral">{labels.filters.due}</Badge>
					<Badge variant="neutral">{labels.filters.origin}</Badge>
					<Badge variant="neutral">{labels.filters.assignee}</Badge>
					<Badge variant="neutral">{labels.filters.department}</Badge>
				</fieldset>
				<div className="flex flex-wrap gap-2">
					{Object.entries(labels.dueFilters).map(([filter, label]) => (
						<Badge key={filter} variant="neutral">
							{label}
						</Badge>
					))}
				</div>
				<div className="grid gap-2 sm:grid-cols-3">
					<Metric label={labels.metrics.open} value={openCount} />
					<Metric label={labels.metrics.overdue} value={overdueCount} />
					<Metric label={labels.metrics.completedThisWeek} value={completedCount} />
				</div>
			</header>

			<div className="grid gap-3">
				{ACTION_BOARD_FIXTURES.map((action) => {
					const rendered = renderActionBoardFixture(action, locale);

					return (
						<Card
							key={action.id}
							title={
								<div className="flex flex-wrap items-center gap-2">
									<span>{rendered.title}</span>
									<Badge variant={statusTone[action.status]}>
										{rendered.statusLabel}
									</Badge>
								</div>
							}
							footer={
								<div className="flex flex-wrap gap-2">
									<Button size="sm" variant="secondary">
										{labels.detail.addAttachment}
									</Button>
									<Button size="sm" variant="secondary">
										{labels.detail.markComplete}
									</Button>
									<Button size="sm" variant="ghost">
										{labels.detail.closeAction}
									</Button>
								</div>
							}
						>
							<div className="grid gap-3 text-sm">
								<p className="m-0 text-[var(--color-muted)]">
									{rendered.description}
								</p>
								<div className="flex flex-wrap gap-2">
									<Badge variant="info">{rendered.originLabel}</Badge>
									{rendered.attachmentLabels.map((attachment) => (
										<Badge key={attachment} variant="neutral">
											{attachment}
										</Badge>
									))}
								</div>
								<dl className="grid gap-2 sm:grid-cols-2">
									<div>
										<dt className="text-[var(--color-muted)]">
											{rendered.fieldLabels.title}
										</dt>
										<dd className="m-0">{rendered.title}</dd>
									</div>
									<div>
										<dt className="text-[var(--color-muted)]">
											{rendered.fieldLabels.status}
										</dt>
										<dd className="m-0">{rendered.statusLabel}</dd>
									</div>
									<div>
										<dt className="text-[var(--color-muted)]">
											{rendered.fieldLabels.description}
										</dt>
										<dd className="m-0">{rendered.description}</dd>
									</div>
									<div>
										<dt className="text-[var(--color-muted)]">
											{rendered.fieldLabels.assignee}
										</dt>
										<dd className="m-0">{rendered.assignee}</dd>
									</div>
									<div>
										<dt className="text-[var(--color-muted)]">
											{rendered.fieldLabels.department}
										</dt>
										<dd className="m-0">{rendered.department}</dd>
									</div>
									<div>
										<dt className="text-[var(--color-muted)]">
											{rendered.fieldLabels.dueDate}
										</dt>
										<dd className="m-0">{rendered.dueDate ?? "-"}</dd>
									</div>
									<div>
										<dt className="text-[var(--color-muted)]">
											{rendered.fieldLabels.origin}
										</dt>
										<dd className="m-0">{rendered.originLabel}</dd>
									</div>
									<div>
										<dt className="text-[var(--color-muted)]">
											{rendered.fieldLabels.attachments}
										</dt>
										<dd className="m-0">
											{rendered.attachmentLabels.length > 0
												? rendered.attachmentLabels.join(", ")
												: "-"}
										</dd>
									</div>
								</dl>
							</div>
						</Card>
					);
				})}
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				<Card
					footer={
						<Button size="sm" variant="secondary">
							{labels.empty.noActions.cta}
						</Button>
					}
					title={labels.empty.noActions.title}
				>
					<p className="m-0 text-sm text-[var(--color-muted)]">
						{labels.empty.noActions.body}
					</p>
				</Card>
				<Card
					footer={
						<Button size="sm" variant="secondary">
							{labels.empty.noMatches.cta}
						</Button>
					}
					title={labels.empty.noMatches.title}
				>
					<p className="m-0 text-sm text-[var(--color-muted)]">
						{labels.empty.noMatches.body}
					</p>
				</Card>
			</div>
		</section>
	);
}

function Metric({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md border border-[var(--color-border)] p-3">
			<div className="text-2xl font-semibold">{value}</div>
			<div className="text-sm text-[var(--color-muted)]">{label}</div>
		</div>
	);
}
