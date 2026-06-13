"use client";

import Badge from "../../../../components/ui/Badge";
import Card from "../../../../components/ui/Card";
import DataTable from "../../../../components/ui/DataTable";
import type { SerializedChemicalControlGroup } from "../../../../lib/chemicals/control-grouping";
import type { ChemicalControlGroupingViewLabels } from "../../../../lib/chemicals/view-labels";

type ChemicalControlGroupingClientProps = {
	readonly groups: readonly SerializedChemicalControlGroup[];
	readonly labels: ChemicalControlGroupingViewLabels;
};

export default function ChemicalControlGroupingClient({
	groups,
	labels,
}: ChemicalControlGroupingClientProps) {
	if (groups.length === 0) {
		return (
			<section className="grid gap-2 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-5">
				<h2 className="m-0 text-base font-semibold">{labels.empty.title}</h2>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{labels.empty.body}
				</p>
			</section>
		);
	}

	return (
		<section className="grid gap-4">
			<div className="grid gap-3 lg:grid-cols-2">
				{groups.map((group) => (
					<Card
						key={`${group.controlType}:${group.controlText}`}
						title={
							<span className="inline-flex flex-wrap items-center gap-2">
								<span>{labels.controlTypes[group.controlType]}</span>
								<Badge variant="neutral">
									{formatCount(
										labels.counts.profileCountTemplate,
										group.profileCount,
									)}
								</Badge>
							</span>
						}
					>
						<div className="grid gap-3">
							<div className="grid gap-1">
								<span className="text-xs text-[var(--color-muted)]">
									{labels.fields.controlText}
								</span>
								<p className="m-0 text-sm font-medium text-[var(--color-text)]">
									{group.controlText}
								</p>
							</div>
							<div className="flex flex-wrap gap-2 text-xs text-[var(--color-muted)]">
								<span>
									{formatCount(
										labels.counts.controlCountTemplate,
										group.controlCount,
									)}
								</span>
							</div>
							<DataTable
								columns={[
									{
										cell: (profile) => (
											<a
												className="font-medium text-[var(--color-text)] underline-offset-4 hover:underline"
												href={`/workspace/chemicals?profile=${profile.id}`}
											>
												{profile.productName}
											</a>
										),
										header: labels.fields.profile,
										key: "productName",
									},
									{
										cell: "manufacturer",
										header: labels.fields.manufacturer,
										key: "manufacturer",
									},
									{
										cell: (profile) => (
											<Badge variant="neutral">
												{labels.profileStatus[profile.profileStatus]}
											</Badge>
										),
										header: labels.fields.status,
										key: "profileStatus",
									},
								]}
								data={[...group.profiles]}
								labels={{
									empty: labels.empty.title,
									nextPage: labels.actions.next,
									pageStatus: (current, total) => `${current}/${total}`,
									previousPage: labels.actions.previous,
								}}
								rowKey="id"
							/>
						</div>
					</Card>
				))}
			</div>
		</section>
	);
}

function formatCount(template: string, count: number): string {
	return template.replace("{count}", String(count));
}
