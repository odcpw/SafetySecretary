"use client";

import Badge from "../Badge";
import EmptyState from "../EmptyState";
import ErrorState from "../ErrorState";
import LoadingState from "../LoadingState";
import StatusBadge from "../StatusBadge";

const STATUS_OPTIONS: Array<{
	status: Parameters<typeof StatusBadge>[number]["status"];
	label: string;
}> = [
	{ status: "open", label: "Open" },
	{ status: "in-progress", label: "In Progress" },
	{ status: "completed", label: "Completed" },
	{ status: "blocked", label: "Blocked" },
];

const BADGE_VARIANTS: Array<Parameters<typeof Badge>[number]["variant"]> = [
	"neutral",
	"info",
	"success",
	"warning",
	"error",
];

export function StatusFixture() {
	return (
		<div className="flex flex-col gap-8 p-4">
			{/* ── Badge ──────────────────────────────────────── */}
			<section aria-labelledby="badge-heading">
				<h2 id="badge-heading" className="mb-2 text-lg font-semibold">
					Badge
				</h2>
				<div className="flex flex-wrap gap-2">
					{BADGE_VARIANTS.map((v) => (
						<Badge key={v} variant={v}>
							{v}
						</Badge>
					))}
				</div>
			</section>

			{/* ── StatusBadge ────────────────────────────────── */}
			<section aria-labelledby="status-badge-heading">
				<h2 id="status-badge-heading" className="mb-2 text-lg font-semibold">
					StatusBadge
				</h2>
				<div className="flex flex-wrap gap-3">
					{STATUS_OPTIONS.map(({ status, label }) => (
						<StatusBadge key={status} status={status} label={label} />
					))}
				</div>
			</section>

			{/* ── EmptyState ─────────────────────────────────── */}
			<section aria-labelledby="empty-heading">
				<h2 id="empty-heading" className="mb-2 text-lg font-semibold">
					EmptyState
				</h2>
				<EmptyState
					icon="◇"
					title="No hazards identified"
					description="Start by adding a hazard for this process step."
					actionLabel="Add hazard"
					onAction={() => {}}
					size="md"
				/>
			</section>

			{/* ── LoadingState ───────────────────────────────── */}
			<section aria-labelledby="loading-heading">
				<h2 id="loading-heading" className="mb-2 text-lg font-semibold">
					LoadingState
				</h2>
				<div className="flex flex-col gap-4">
					<LoadingState variant="spinner" />
					<LoadingState variant="skeleton" rows={4} />
				</div>
			</section>

			{/* ── ErrorState ─────────────────────────────────── */}
			<section aria-labelledby="error-heading">
				<h2 id="error-heading" className="mb-2 text-lg font-semibold">
					ErrorState
				</h2>
				<ErrorState
					title="Unable to load HIRA"
					message="Try again in a moment."
					code="fetch_failed"
					details="The HIRA could not be loaded."
					retryLabel="Retry"
					onRetry={() => {}}
				/>
			</section>
		</div>
	);
}
