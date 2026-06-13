"use client";

import Image from "next/image";

import Badge from "../../../../components/ui/Badge";
import Button from "../../../../components/ui/Button";
import Card from "../../../../components/ui/Card";
import DataTable from "../../../../components/ui/DataTable";
import type { ChemicalControlType } from "../../../../lib/chemicals/chemical-control";
import type { SerializedChemicalRecapCard } from "../../../../lib/chemicals/recap-queries";
import type { ChemicalRecapViewLabels } from "../../../../lib/chemicals/view-labels";
import type { Locale } from "../../../../lib/i18n/types";

type ChemicalRecapClientProps = {
	readonly cards: readonly SerializedChemicalRecapCard[];
	readonly labels: ChemicalRecapViewLabels;
	readonly locale: Locale;
};

const FIRST_ACTION_TYPES = new Set<ChemicalControlType>([
	"first_aid",
	"fire_fighting",
	"spill_response",
]);

export default function ChemicalRecapClient({
	cards,
	labels,
	locale,
}: ChemicalRecapClientProps) {
	if (cards.length === 0) {
		return (
			<section className="grid gap-2 rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-5 print:border-neutral-300 print:bg-white">
				<h2 className="m-0 text-base font-semibold">{labels.empty.title}</h2>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{labels.empty.body}
				</p>
			</section>
		);
	}

	return (
		<section className="grid gap-4" data-toolbox-talk-source="chemical-recap">
			<div className="flex justify-end print:hidden">
				<Button
					onClick={() => window.print()}
					type="button"
					variant="secondary"
				>
					{labels.actions.print}
				</Button>
			</div>
			<div className="grid gap-4 xl:grid-cols-2 print:block">
				{cards.map((card) => (
					<RecapCard
						card={card}
						key={card.id}
						labels={labels}
						locale={locale}
					/>
				))}
			</div>
		</section>
	);
}

function RecapCard({
	card,
	labels,
	locale,
}: {
	readonly card: SerializedChemicalRecapCard;
	readonly labels: ChemicalRecapViewLabels;
	readonly locale: Locale;
}) {
	const firstActions = card.controls.filter((control) =>
		FIRST_ACTION_TYPES.has(control.controlType),
	);
	const criticalChecks = card.controls.filter(
		(control) => !FIRST_ACTION_TYPES.has(control.controlType),
	);
	const imageControls = card.controls.filter(
		(control) => control.sourceStorageIsImage && control.sourceStoragePath,
	);

	return (
		<Card
			className="break-inside-avoid print:mb-4 print:border-neutral-300 print:bg-white"
			title={
				<span className="inline-flex flex-wrap items-center gap-2">
					<span>{card.productName}</span>
					<Badge variant="neutral">{card.manufacturer}</Badge>
				</span>
			}
		>
			<article className="grid gap-4" data-chemical-recap-card={card.id}>
				<div className="grid gap-2 text-sm md:grid-cols-2">
					<Field
						label={labels.fields.usageContext}
						value={labels.fields.generalUse}
					/>
					<Field label={labels.fields.casNumber} value={card.casNumber} />
					<Field label={labels.fields.unNumber} value={card.unNumber} />
					<Field
						label={labels.fields.sdsReviewed}
						value={reviewedText({
							email: card.sdsReviewedByUserEmail,
							labels,
							locale,
							reviewed: card.sdsReviewed,
							reviewedAt: card.sdsReviewedAt,
						})}
					/>
					{card.storagePath ? (
						<a
							className="text-sm text-[var(--color-text)] underline-offset-4 hover:underline"
							href={storageUrl(card.storagePath)}
						>
							{labels.fields.sdsFile}
						</a>
					) : (
						<Field label={labels.fields.sdsFile} value={labels.fields.none} />
					)}
				</div>

				<ControlTable card={card} labels={labels} locale={locale} />

				{firstActions.length > 0 && (
					<ControlList
						controls={firstActions}
						labels={labels}
						title={labels.sections.firstActions}
					/>
				)}

				{criticalChecks.length > 0 && (
					<ControlList
						controls={criticalChecks}
						labels={labels}
						title={labels.sections.criticalChecks}
					/>
				)}

				{imageControls.length > 0 && (
					<div className="grid gap-2">
						<h4 className="m-0 text-sm font-medium">
							{labels.sections.photos}
						</h4>
						<div className="grid gap-2 sm:grid-cols-2">
							{imageControls.map((control) => (
								<figure
									className="m-0 grid gap-1 rounded-md border border-[var(--color-border)] p-2 print:border-neutral-300"
									key={control.id}
								>
									<Image
										alt={`${labels.sections.photos}: ${control.controlText}`}
										className="max-h-40 w-full rounded object-contain"
										height={160}
										src={storageUrl(control.sourceStoragePath ?? "")}
										unoptimized
										width={320}
									/>
									<figcaption className="text-xs text-[var(--color-muted)]">
										{control.sourceFilename ?? control.controlText}
									</figcaption>
								</figure>
							))}
						</div>
					</div>
				)}
			</article>
		</Card>
	);
}

function ControlTable({
	card,
	labels,
	locale,
}: {
	readonly card: SerializedChemicalRecapCard;
	readonly labels: ChemicalRecapViewLabels;
	readonly locale: Locale;
}) {
	return (
		<DataTable
			columns={[
				{
					cell: (control) => labels.controlTypes[control.controlType],
					header: labels.fields.controlType,
					key: "controlType",
				},
				{
					cell: "controlText",
					header: labels.fields.controlText,
					key: "controlText",
				},
				{
					cell: (control) => sourceText(control, labels),
					header: labels.fields.reviewedSource,
					key: "sourceExcerpt",
				},
				{
					cell: (control) =>
						reviewedText({
							email: control.reviewedByUserEmail,
							labels,
							locale,
							reviewed: true,
							reviewedAt: control.reviewedAt,
						}),
					header: labels.fields.reviewedByAt,
					key: "reviewedAt",
				},
			]}
			data={[...card.controls]}
			labels={{
				empty: labels.empty.body,
				nextPage: labels.actions.next,
				pageStatus: (current, total) => `${current}/${total}`,
				previousPage: labels.actions.previous,
			}}
			rowKey="id"
		/>
	);
}

function ControlList({
	controls,
	labels,
	title,
}: {
	readonly controls: SerializedChemicalRecapCard["controls"];
	readonly labels: ChemicalRecapViewLabels;
	readonly title: string;
}) {
	return (
		<div className="grid gap-2">
			<h4 className="m-0 text-sm font-medium">{title}</h4>
			<ul className="m-0 grid gap-1 pl-5 text-sm">
				{controls.map((control) => (
					<li key={control.id}>
						<span className="font-medium">
							{labels.controlTypes[control.controlType]}:
						</span>{" "}
						{control.controlText}
					</li>
				))}
			</ul>
		</div>
	);
}

function Field({
	label,
	value,
}: {
	readonly label: string;
	readonly value: string | null;
}) {
	return (
		<div className="grid gap-1">
			<span className="text-xs text-[var(--color-muted)]">{label}</span>
			<span className="text-sm text-[var(--color-text)]">{value ?? "-"}</span>
		</div>
	);
}

function reviewedText(input: {
	readonly email: string | null;
	readonly labels: ChemicalRecapViewLabels;
	readonly locale: Locale;
	readonly reviewed: boolean;
	readonly reviewedAt: string | null;
}): string {
	if (!input.reviewed || !input.reviewedAt) {
		return input.labels.fields.none;
	}

	const date = new Date(input.reviewedAt).toLocaleDateString(input.locale, {
		timeZone: "UTC",
	});
	return input.email
		? input.labels.templates.reviewedByAt
				.replace("{email}", input.email)
				.replace("{date}", date)
		: date;
}

function sourceText(
	control: SerializedChemicalRecapCard["controls"][number],
	labels: ChemicalRecapViewLabels,
): string {
	const parts = [
		control.sdsSection,
		control.pageLineRef,
		control.sourceExcerpt,
		control.sourceFilename,
	].filter(Boolean);

	return parts.length > 0 ? parts.join(" - ") : labels.fields.none;
}

function storageUrl(storagePath: string): string {
	return `/api/storage/${storagePath
		.split("/")
		.map((part) => encodeURIComponent(part))
		.join("/")}`;
}
