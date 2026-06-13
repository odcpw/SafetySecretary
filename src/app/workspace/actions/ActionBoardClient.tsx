"use client";

import { useMemo, useState } from "react";
import InspectorPanel from "../../../components/layout/InspectorPanel";
import Badge from "../../../components/ui/Badge";
import DataTable from "../../../components/ui/DataTable";
import EmptyState from "../../../components/ui/EmptyState";
import Select from "../../../components/ui/Select";
import StatusBadge from "../../../components/ui/StatusBadge";
import type {
	ActionItemOriginType,
	ActionItemStatus,
} from "../../../lib/actions/action-item";
import { ACTION_ITEM_STATUSES } from "../../../lib/actions/action-item";
import {
	type ActionBoardAttentionFilter,
	filterActionItemsForBoard,
	isActionItemOverdue,
} from "../../../lib/actions/filters";
import {
	ACTION_BOARD_ACTION_ORIGIN_LABEL_KEYS,
	ACTION_BOARD_DUE_FILTER_LABEL_KEYS,
	ACTION_BOARD_DUE_FILTERS,
	ACTION_BOARD_EFFECTIVENESS_LABEL_KEYS,
	ACTION_BOARD_PRIORITY_LABEL_KEYS,
	ACTION_BOARD_STATUS_LABEL_KEYS,
	ACTION_BOARD_VERIFICATION_LABEL_KEYS,
	type actionBoardLabels,
} from "../../../lib/actions/fixtures";
import {
	type ActionManagerBucket,
	type ActionManagerMetrics,
	type ActionManagerRelatedCounts,
	summarizeActionManagerMetrics,
} from "../../../lib/actions/metric-summary";
import type { SerializedActionItemListRow } from "../../../lib/actions/queries";
import { t } from "../../../lib/i18n/t";
import type { Locale } from "../../../lib/i18n/types";

type ActionBoardClientProps = {
	readonly initialActions: readonly SerializedActionItemListRow[];
	readonly initialFilters?: ActionBoardFilterState;
	readonly initialMetrics: ActionManagerMetrics;
	readonly labels: ReturnType<typeof actionBoardLabels>;
	readonly locale: Locale;
};

type StatusFilter = ActionItemStatus | "all";
type DueFilter = (typeof ACTION_BOARD_DUE_FILTERS)[number];
type OriginFilter = ActionItemOriginType | "all";
type AttentionFilter = ActionBoardAttentionFilter;
export type ActionBoardFilterState = {
	readonly assignee: string;
	readonly department: string;
	readonly due: DueFilter;
	readonly origin: OriginFilter;
	readonly status: StatusFilter;
};

const STATUS_OPTIONS: readonly StatusFilter[] = [
	"all",
	"open",
	"in_progress",
	"completed",
	"cancelled",
];

const DUE_OPTIONS: readonly DueFilter[] = ACTION_BOARD_DUE_FILTERS;

export default function ActionBoardClient({
	initialActions,
	initialFilters = defaultFilters,
	initialMetrics,
	labels,
	locale,
}: ActionBoardClientProps) {
	const [selectedId, setSelectedId] = useState<string | null>(
		initialActions[0]?.id ?? null,
	);
	const [detailOpen, setDetailOpen] = useState(false);
	const [statusFilter, setStatusFilter] = useState<StatusFilter>(
		initialFilters.status,
	);
	const [dueFilter, setDueFilter] = useState<DueFilter>(initialFilters.due);
	const [originFilter, setOriginFilter] = useState<OriginFilter>(
		initialFilters.origin,
	);
	const [assigneeFilter, setAssigneeFilter] = useState(initialFilters.assignee);
	const [departmentFilter, setDepartmentFilter] = useState(
		initialFilters.department,
	);
	const [attentionFilter, setAttentionFilter] =
		useState<AttentionFilter>("all");
	const actions = useMemo(() => [...initialActions], [initialActions]);
	const filteredActions = useMemo(
		() =>
			filterActionItemsForBoard(actions, {
				attention: attentionFilter,
				assignee: assigneeFilter,
				department: departmentFilter,
				due: dueFilter,
				origin: originFilter,
				status: statusFilter,
			}),
		[
			actions,
			attentionFilter,
			assigneeFilter,
			departmentFilter,
			dueFilter,
			originFilter,
			statusFilter,
		],
	);
	const metrics = useMemo(
		() => summarizeActionManagerMetrics(filteredActions),
		[filteredActions],
	);
	const selectedAction =
		filteredActions.find((action) => action.id === selectedId) ?? null;
	const assigneeOptions = useMemo(
		() => uniqueTextOptions(actions.map((action) => action.assigneeLabel)),
		[actions],
	);
	const departmentOptions = useMemo(
		() => uniqueTextOptions(actions.map((action) => action.departmentText)),
		[actions],
	);
	const originOptions = useMemo(() => uniqueOriginOptions(actions), [actions]);

	function openDetail(action: SerializedActionItemListRow) {
		setSelectedId(action.id);
		setDetailOpen(true);
	}

	function clearFilters() {
		setAssigneeFilter("all");
		setDepartmentFilter("all");
		setDueFilter("all");
		setOriginFilter("all");
		setStatusFilter("all");
		setAttentionFilter("all");
		setDetailOpen(false);
	}

	function applyFilter(update: () => void) {
		update();
		setDetailOpen(false);
	}

	function showOverdueActions() {
		applyFilter(() => {
			setAttentionFilter("all");
			setDueFilter("overdue");
			setStatusFilter("all");
		});
	}

	function showDueSoonActions() {
		applyFilter(() => {
			setAttentionFilter("all");
			setDueFilter("due_this_week");
			setStatusFilter("all");
		});
	}

	function showNeedsFollowUpActions() {
		applyFilter(() => {
			setAttentionFilter("needs_follow_up");
			setDueFilter("all");
			setStatusFilter("all");
		});
	}

	function showUnverifiedClosedActions() {
		applyFilter(() => {
			setAttentionFilter("unverified_closed");
			setDueFilter("all");
			setStatusFilter("completed");
		});
	}

	return (
		<div className="grid gap-4">
			<section className="grid gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
				<div className="grid gap-3">
					<fieldset className="m-0 grid gap-3 border-0 p-0">
						<legend className="sr-only">{labels.list.filters}</legend>
						<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
							<Select
								label={labels.filters.status}
								onChange={(value) =>
									applyFilter(() => setStatusFilter(value as StatusFilter))
								}
								options={STATUS_OPTIONS.map((value) => ({
									label:
										value === "all"
											? labels.filters.all
											: t(ACTION_BOARD_STATUS_LABEL_KEYS[value], locale),
									value,
								}))}
								value={statusFilter}
							/>
							<Select
								label={labels.filters.due}
								onChange={(value) =>
									applyFilter(() => setDueFilter(value as DueFilter))
								}
								options={DUE_OPTIONS.map((value) => ({
									label: t(ACTION_BOARD_DUE_FILTER_LABEL_KEYS[value], locale),
									value,
								}))}
								value={dueFilter}
							/>
							<Select
								label={labels.filters.origin}
								onChange={(value) =>
									applyFilter(() => setOriginFilter(value as OriginFilter))
								}
								options={[
									{ label: labels.filters.all, value: "all" },
									...selectOptionsWithCurrent(originFilter, originOptions).map(
										(origin) => ({
											label: originTypeLabel(origin, locale),
											value: origin,
										}),
									),
								]}
								value={originFilter}
							/>
							<Select
								label={labels.filters.assignee}
								onChange={(value) =>
									applyFilter(() => setAssigneeFilter(value))
								}
								options={[
									{ label: labels.filters.all, value: "all" },
									...selectOptionsWithCurrent(
										assigneeFilter,
										assigneeOptions,
									).map((value) => ({ label: value, value })),
								]}
								value={assigneeFilter}
							/>
							<Select
								label={labels.filters.department}
								onChange={(value) =>
									applyFilter(() => setDepartmentFilter(value))
								}
								options={[
									{ label: labels.filters.all, value: "all" },
									...selectOptionsWithCurrent(
										departmentFilter,
										departmentOptions,
									).map((value) => ({
										label: value,
										value,
									})),
								]}
								value={departmentFilter}
							/>
						</div>
					</fieldset>

					<ActionManagerMetricsPanel
						labels={labels}
						locale={locale}
						metrics={metrics}
						onAssigneeFilter={(value) =>
							applyFilter(() => setAssigneeFilter(value))
						}
						onDepartmentFilter={(value) =>
							applyFilter(() => setDepartmentFilter(value))
						}
						onDueSoon={showDueSoonActions}
						onNeedsFollowUp={showNeedsFollowUpActions}
						onOriginFilter={(value) =>
							applyFilter(() => setOriginFilter(value))
						}
						onOverdue={showOverdueActions}
						onStatusFilter={(value) =>
							applyFilter(() => setStatusFilter(value))
						}
						relatedCounts={initialMetrics.relatedCounts}
						onUnverifiedClosed={showUnverifiedClosedActions}
					/>
				</div>

				{initialActions.length === 0 ? (
					<EmptyState
						actionLabel={labels.empty.noActions.cta}
						description={labels.empty.noActions.body}
						size="lg"
						title={labels.empty.noActions.title}
					/>
				) : filteredActions.length === 0 ? (
					<EmptyState
						actionLabel={labels.empty.noMatches.cta}
						description={labels.empty.noMatches.body}
						onAction={clearFilters}
						title={labels.empty.noMatches.title}
					/>
				) : (
					<DataTable
						columns={[
							{
								cell: (action) => (
									<div className="grid gap-1">
										<span className="font-medium text-[var(--color-text)]">
											{action.title}
										</span>
										<span className="text-xs text-[var(--color-muted)]">
											{action.originLabel}
										</span>
									</div>
								),
								header: labels.fields.title,
								key: "title",
							},
							{
								cell: (action) => (
									<StatusBadge
										label={t(
											ACTION_BOARD_STATUS_LABEL_KEYS[action.status],
											locale,
										)}
										size="sm"
										status={statusBadgeState(action.status)}
									/>
								),
								header: labels.filters.status,
								key: "status",
							},
							{
								cell: (action) => (
									<span className={dueDateClassName(action)}>
										{action.dueDate ?? ""}
									</span>
								),
								header: labels.fields.dueDate,
								key: "dueDate",
							},
							{
								cell: (action) => action.assigneeLabel ?? "",
								header: labels.fields.assignee,
								key: "assigneeLabel",
							},
							{
								cell: (action) => action.departmentText ?? "",
								header: labels.fields.department,
								key: "departmentText",
							},
							{
								cell: (action) => (
									<Badge variant="neutral">
										{originTypeLabel(action.originType, locale)}
									</Badge>
								),
								header: labels.fields.origin,
								key: "originType",
							},
						]}
						data={filteredActions}
						labels={{
							empty: labels.empty.noMatches.title,
							nextPage: labels.empty.noMatches.cta,
							pageStatus: (current, total) => `${current}/${total}`,
							previousPage: labels.empty.noMatches.cta,
						}}
						onRowSelect={openDetail}
						rowKey="id"
					/>
				)}
			</section>

			<InspectorPanel
				isOpen={Boolean(selectedAction && detailOpen)}
				onClose={() => setDetailOpen(false)}
				title={selectedAction?.title ?? labels.list.title}
			>
				{selectedAction ? (
					<ActionDetail
						action={selectedAction}
						labels={labels}
						locale={locale}
					/>
				) : null}
			</InspectorPanel>
		</div>
	);
}

function ActionManagerMetricsPanel({
	labels,
	locale,
	metrics,
	onAssigneeFilter,
	onDepartmentFilter,
	onDueSoon,
	onNeedsFollowUp,
	onOriginFilter,
	onOverdue,
	onStatusFilter,
	relatedCounts,
	onUnverifiedClosed,
}: {
	labels: ReturnType<typeof actionBoardLabels>;
	locale: Locale;
	metrics: ActionManagerMetrics;
	onAssigneeFilter: (value: string) => void;
	onDepartmentFilter: (value: string) => void;
	onDueSoon: () => void;
	onNeedsFollowUp: () => void;
	onOriginFilter: (value: ActionItemOriginType) => void;
	onOverdue: () => void;
	onStatusFilter: (value: StatusFilter) => void;
	relatedCounts: ActionManagerRelatedCounts;
	onUnverifiedClosed: () => void;
}) {
	const statusBuckets = ACTION_ITEM_STATUSES.map((status) => ({
		count: metrics.statusCounts[status],
		label: t(ACTION_BOARD_STATUS_LABEL_KEYS[status], locale),
		value: status,
	})).filter((bucket) => bucket.count > 0);

	return (
		<section className="grid gap-3" aria-labelledby="action-weekly-rhythm">
			<div className="grid gap-1">
				<h2 id="action-weekly-rhythm" className="m-0 text-base font-semibold">
					{labels.metrics.weeklyRhythmTitle}
				</h2>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{labels.metrics.weeklyRhythmBody}
				</p>
			</div>

			<div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
				<MetricButton
					label={labels.metrics.overdue}
					onClick={onOverdue}
					tone={metrics.overdueActions > 0 ? "warning" : "neutral"}
					value={metrics.overdueActions}
				/>
				<MetricButton
					label={labels.metrics.dueSoon}
					onClick={onDueSoon}
					value={metrics.dueSoonActions}
				/>
				<MetricButton
					label={labels.metrics.needsFollowUp}
					onClick={onNeedsFollowUp}
					tone={metrics.needsFollowUpActions > 0 ? "warning" : "neutral"}
					value={metrics.needsFollowUpActions}
				/>
				<MetricButton
					label={labels.metrics.unverifiedClosures}
					onClick={onUnverifiedClosed}
					tone={metrics.unverifiedClosedActions > 0 ? "warning" : "neutral"}
					value={metrics.unverifiedClosedActions}
				/>
			</div>

			<div className="grid gap-2">
				<h3 className="m-0 text-sm font-semibold">
					{labels.metrics.relatedQueues}
				</h3>
				<div className="grid gap-2 md:grid-cols-2">
					<MetricLink
						href="/workspace/chemicals"
						label={labels.metrics.pendingSdsReviews}
						value={relatedCounts.pendingSdsReviews}
					/>
					<MetricLink
						href="/workspace/actions/new?sourceQueue=findings_without_action"
						label={labels.metrics.findingsWithoutAction}
						value={relatedCounts.findingsWithoutLinkedAction}
					/>
				</div>
			</div>

			<div className="grid gap-2 lg:grid-cols-4">
				<MetricBreakdown
					buckets={statusBuckets}
					emptyLabel={labels.metrics.noBreakdown}
					label={labels.metrics.statusBreakdown}
					onSelect={(bucket) => onStatusFilter(bucket.value as StatusFilter)}
				/>
				<MetricBreakdown
					buckets={metrics.byOriginType.map((bucket) => ({
						...bucket,
						label: originTypeLabel(
							bucket.value as ActionItemOriginType,
							locale,
						),
					}))}
					emptyLabel={labels.metrics.noBreakdown}
					label={labels.metrics.originBreakdown}
					onSelect={(bucket) =>
						onOriginFilter(bucket.value as ActionItemOriginType)
					}
				/>
				<MetricBreakdown
					buckets={metrics.byDepartment}
					emptyLabel={labels.metrics.noBreakdown}
					label={labels.metrics.departmentBreakdown}
					onSelect={(bucket) => onDepartmentFilter(bucket.value)}
				/>
				<MetricBreakdown
					buckets={metrics.byAssignee}
					emptyLabel={labels.metrics.noBreakdown}
					label={labels.metrics.assigneeBreakdown}
					onSelect={(bucket) => onAssigneeFilter(bucket.value)}
				/>
			</div>
		</section>
	);
}

function MetricButton({
	label,
	onClick,
	tone = "neutral",
	value,
}: {
	label: string;
	onClick: () => void;
	tone?: "neutral" | "warning";
	value: number;
}) {
	return (
		<button
			className={`grid min-h-24 gap-1 rounded-md border p-3 text-left hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elev)] ${
				tone === "warning"
					? "border-[var(--color-accent)] bg-[var(--color-surface-elev)]"
					: "border-[var(--color-border)] bg-transparent"
			}`}
			onClick={onClick}
			type="button"
		>
			<span className="text-2xl font-semibold">{value}</span>
			<span className="text-sm text-[var(--color-muted)]">{label}</span>
		</button>
	);
}

function MetricLink({
	href,
	label,
	value,
}: {
	href: string;
	label: string;
	value: number;
}) {
	return (
		<a
			className="grid min-h-24 gap-1 rounded-md border border-[var(--color-border)] p-3 text-left hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elev)]"
			href={href}
		>
			<span className="text-2xl font-semibold">{value}</span>
			<span className="text-sm text-[var(--color-muted)]">{label}</span>
		</a>
	);
}

function MetricBreakdown({
	buckets,
	emptyLabel,
	label,
	onSelect,
}: {
	buckets: readonly ActionManagerBucket[];
	emptyLabel: string;
	label: string;
	onSelect: (bucket: ActionManagerBucket) => void;
}) {
	return (
		<div className="grid gap-2 rounded-md border border-[var(--color-border)] p-3">
			<h3 className="m-0 text-sm font-semibold">{label}</h3>
			{buckets.length === 0 ? (
				<p className="m-0 text-sm text-[var(--color-muted)]">{emptyLabel}</p>
			) : (
				<div className="grid gap-1">
					{buckets.map((bucket) => (
						<button
							className="grid grid-cols-[1fr_auto] items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-[var(--color-surface-elev)]"
							key={`${bucket.value}:${bucket.label}`}
							onClick={() => onSelect(bucket)}
							type="button"
						>
							<span className="truncate text-[var(--color-muted)]">
								{bucket.label}
							</span>
							<span className="font-semibold text-[var(--color-text)]">
								{bucket.count}
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function ActionDetail({
	action,
	labels,
	locale,
}: {
	action: SerializedActionItemListRow;
	labels: ReturnType<typeof actionBoardLabels>;
	locale: Locale;
}) {
	return (
		<div className="grid gap-4">
			<div className="grid gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<StatusBadge
						label={t(ACTION_BOARD_STATUS_LABEL_KEYS[action.status], locale)}
						size="sm"
						status={statusBadgeState(action.status)}
					/>
					<Badge variant={action.isSafetyCritical ? "error" : "neutral"}>
						{originTypeLabel(action.originType, locale)}
					</Badge>
					{actionNeedsFollowUp(action) ? (
						<Badge variant="warning">{labels.detail.needsFollowUp}</Badge>
					) : null}
				</div>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{action.description ?? action.originLabel}
				</p>
			</div>

			<dl className="grid gap-3 md:grid-cols-2">
				<DetailItem label={labels.fields.title} value={action.title} />
				<DetailItem
					label={labels.fields.status}
					value={t(ACTION_BOARD_STATUS_LABEL_KEYS[action.status], locale)}
				/>
				<DetailItem label={labels.fields.dueDate} value={action.dueDate} />
				<DetailItem
					label={labels.fields.assignee}
					value={action.assigneeLabel}
				/>
				<DetailItem
					label={labels.fields.department}
					value={action.departmentText}
				/>
				<DetailItem
					label={labels.fields.priority}
					value={t(ACTION_BOARD_PRIORITY_LABEL_KEYS[action.priority], locale)}
				/>
				<DetailItem
					label={labels.fields.isSafetyCritical}
					value={t(
						action.isSafetyCritical ? "common.yes" : "common.no",
						locale,
					)}
				/>
				<DetailItem label={labels.fields.origin} value={action.originLabel} />
				<DetailItem
					label={labels.fields.verificationStatus}
					value={t(
						ACTION_BOARD_VERIFICATION_LABEL_KEYS[action.verificationStatus],
						locale,
					)}
				/>
				<DetailItem
					label={labels.fields.effectiveness}
					value={t(
						ACTION_BOARD_EFFECTIVENESS_LABEL_KEYS[action.effectivenessResult],
						locale,
					)}
				/>
				<DetailItem
					label={labels.fields.verificationNote}
					value={action.verificationNote}
				/>
				<DetailItem
					label={labels.fields.description}
					value={action.description}
				/>
				<DetailItem
					label={labels.fields.attachments}
					value={String(action.attachmentCount)}
				/>
			</dl>

			<div className="flex flex-wrap gap-2">
				<a
					className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-bg)] hover:opacity-90"
					href={`/workspace/actions/${action.id}`}
				>
					{labels.detail.editAction}
				</a>
				<a
					className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elev)]"
					href={`/workspace/actions/${action.id}?focus=attachments`}
				>
					{labels.detail.addAttachment}
				</a>
				<a
					className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elev)]"
					href={`/workspace/actions/${action.id}?focus=closure`}
				>
					{labels.detail.markComplete}
				</a>
				{actionNeedsFollowUp(action) ? (
					<a
						className="inline-flex min-h-10 items-center justify-center rounded-md border border-transparent bg-transparent px-3 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
						href={`/workspace/actions/new?followUpFrom=${action.id}`}
					>
						{labels.form.createFollowUp}
					</a>
				) : null}
			</div>
		</div>
	);
}

function DetailItem({ label, value }: { label: string; value: string | null }) {
	return (
		<div className="grid gap-1 rounded-md border border-[var(--color-border)] p-3">
			<dt className="text-xs text-[var(--color-muted)]">{label}</dt>
			<dd className="m-0 text-sm font-medium text-[var(--color-text)]">
				{value ?? "-"}
			</dd>
		</div>
	);
}

function uniqueTextOptions(values: readonly (string | null)[]): string[] {
	return [
		...new Set(values.filter((value): value is string => Boolean(value))),
	].sort((left, right) => left.localeCompare(right));
}

function uniqueOriginOptions(
	actions: readonly SerializedActionItemListRow[],
): ActionItemOriginType[] {
	return [...new Set(actions.map((action) => action.originType))].sort(
		(left, right) =>
			originTypeLabel(left, "en").localeCompare(originTypeLabel(right, "en")),
	);
}

function statusBadgeState(status: ActionItemStatus) {
	if (status === "in_progress") {
		return "in-progress";
	}
	if (status === "completed") {
		return "completed";
	}
	if (status === "cancelled") {
		return "blocked";
	}
	return "open";
}

function originTypeLabel(
	originType: ActionItemOriginType,
	locale: Locale,
): string {
	return t(ACTION_BOARD_ACTION_ORIGIN_LABEL_KEYS[originType], locale);
}

function actionNeedsFollowUp(action: SerializedActionItemListRow): boolean {
	return (
		action.verificationStatus === "needs_follow_up" ||
		action.effectivenessResult === "needs_follow_up"
	);
}

function dueDateClassName(action: SerializedActionItemListRow): string {
	return isActionItemOverdue(action)
		? "font-medium text-[var(--color-accent)]"
		: "";
}

function selectOptionsWithCurrent<T extends string>(
	current: T | "all",
	options: readonly T[],
): T[] {
	if (current === "all" || options.includes(current)) {
		return [...options];
	}
	return [current, ...options];
}

const defaultFilters: ActionBoardFilterState = {
	assignee: "all",
	department: "all",
	due: "all",
	origin: "all",
	status: "all",
};
