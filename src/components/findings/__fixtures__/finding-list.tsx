"use client";

import { FINDING_FIXTURES, renderFindingFixture } from "../../../lib/findings/fixtures";
import type { Locale } from "../../../lib/i18n/types";
import Badge from "../../ui/Badge";
import Card from "../../ui/Card";

const severityTone = {
	high: "error",
	low: "neutral",
	medium: "warning",
	watch: "info",
} as const;

const statusTone = {
	action_created: "info",
	dismissed: "neutral",
	open: "warning",
	resolved: "success",
} as const;

export function FindingListFixture({ locale = "en" }: { locale?: Locale }) {
	return (
		<div className="grid gap-3 p-4">
			{FINDING_FIXTURES.map((finding) => {
				const rendered = renderFindingFixture(finding, locale);

				return (
					<Card
						key={finding.id}
						title={
							<div className="flex flex-wrap items-center gap-2">
								<span>{rendered.title}</span>
								{rendered.goodCatch.enabled && (
									<Badge variant="success">{rendered.goodCatch.badge}</Badge>
								)}
							</div>
						}
						footer={<span>{rendered.noBlameNote}</span>}
					>
						<div className="grid gap-3 text-sm">
							<div className="flex flex-wrap gap-2">
								<Badge variant="info">{rendered.typeLabel}</Badge>
								<Badge variant={statusTone[finding.status]}>
									{rendered.statusLabel}
								</Badge>
								<Badge variant={severityTone[finding.severity]}>
									{rendered.severityLabel}
								</Badge>
							</div>

							<dl className="grid gap-2 sm:grid-cols-2">
								<div>
									<dt className="text-[var(--color-muted)]">
										{rendered.fieldLabels.location}
									</dt>
									<dd className="m-0">{rendered.location}</dd>
								</div>
								<div>
									<dt className="text-[var(--color-muted)]">
										{rendered.fieldLabels.observedBy}
									</dt>
									<dd className="m-0">{rendered.observedByRole}</dd>
								</div>
								<div>
									<dt className="text-[var(--color-muted)]">
										{rendered.fieldLabels.owner}
									</dt>
									<dd className="m-0">{rendered.ownerRole ?? "-"}</dd>
								</div>
								<div>
									<dt className="text-[var(--color-muted)]">
										{rendered.fieldLabels.type}
									</dt>
									<dd className="m-0">{rendered.typeLabel}</dd>
								</div>
							</dl>

							{rendered.goodCatch.enabled && (
								<p className="m-0 text-[var(--color-muted)]">
									{rendered.goodCatch.body}
								</p>
							)}
						</div>
					</Card>
				);
			})}
		</div>
	);
}
