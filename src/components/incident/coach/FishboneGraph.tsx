"use client";

import { useMemo } from "react";
import {
	type FishboneStatus,
	layoutFishbone,
} from "../../../lib/incident/fishbone-layout";
import type { IncidentRecord } from "./types";

// On-screen (dark-theme) Ishikawa / fishbone renderer. The geometry lives in
// lib/incident/fishbone-layout.ts and is fed the SAME LayoutInput shape as the
// tidy-tree layout, so the two views read the same data. This component owns
// only the dark palette + legend (matching CauseGraph) and the SVG drawing.
// Read-only for v1 — editing stays on the Causes/Actions tabs and the tree view.

const LABELS: Record<
	string,
	{ method: string; legend: Record<string, string>; empty: string }
> = {
	en: {
		method: "Method",
		legend: {
			event: "Effect",
			open: "Open",
			root: "Root cause",
			parked: "Parked",
			measure: "Measure",
		},
		empty: "No causes recorded yet.",
	},
	de: {
		method: "Methode",
		legend: {
			event: "Wirkung",
			open: "Offen",
			root: "Grundursache",
			parked: "Geparkt",
			measure: "Massnahme",
		},
		empty: "Noch keine Ursachen erfasst.",
	},
	fr: {
		method: "Méthode",
		legend: {
			event: "Effet",
			open: "Ouvert",
			root: "Cause racine",
			parked: "En attente",
			measure: "Mesure",
		},
		empty: "Aucune cause enregistrée pour l'instant.",
	},
	it: {
		method: "Metodo",
		legend: {
			event: "Effetto",
			open: "Aperto",
			root: "Causa radice",
			parked: "In sospeso",
			measure: "Misura",
		},
		empty: "Nessuna causa ancora registrata.",
	},
};

function labelsFor(locale: string) {
	return LABELS[locale.split("-")[0]?.toLowerCase() ?? "en"] ?? LABELS.en;
}

// Same semantic palette as CauseGraph's STATUS_STYLE, expressed for SVG strokes.
const STATUS_STROKE: Record<FishboneStatus, string> = {
	event: "var(--color-accent)",
	open: "var(--color-border)",
	root: "var(--color-accent)",
	parked: "var(--color-muted)",
	treated: "var(--color-border)",
};

const STATUS_DOT: Record<FishboneStatus, string> = {
	event: "var(--color-danger)",
	open: "var(--color-muted)",
	root: "var(--color-accent)",
	parked: "var(--color-muted)",
	treated: "var(--color-accent)",
};

/** Clamp a label so a single-line SVG <text> stays readable. */
function clampLabel(label: string, max: number): string {
	const trimmed = label.trim();
	if (trimmed.length <= max) {
		return trimmed;
	}
	return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

export default function FishboneGraph({
	record,
	locale,
	method,
}: {
	readonly record: IncidentRecord;
	readonly locale: string;
	readonly method?: string;
}) {
	const labels = labelsFor(locale);

	const layout = useMemo(
		() =>
			layoutFishbone({
				actions: record.actions,
				causes: record.causes,
				eventTitle: record.incident.title || labels.legend.event,
			}),
		[record, labels.legend.event],
	);

	if (layout.empty) {
		return (
			<div className="grid place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-sm text-[var(--color-muted)]">
				{labels.legend.event}: {record.incident.title || "—"} — {labels.empty}
			</div>
		);
	}

	const { spine, head, bones, width, height } = layout;

	return (
		<div className="grid gap-2">
			<div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-muted)]">
				{method ? (
					<span className="rounded bg-[var(--color-surface-elev)] px-2 py-0.5 font-medium text-[var(--color-text)]">
						{labels.method}: {method}
					</span>
				) : null}
				{(["root", "open", "parked", "measure"] as const).map((key) => (
					<span className="inline-flex items-center gap-1" key={key}>
						<span
							className="inline-block size-2 rounded-full"
							style={{
								background:
									key === "measure" ? "var(--color-accent)" : STATUS_DOT[key],
							}}
						/>
						{labels.legend[key]}
					</span>
				))}
			</div>
			<div
				className="relative overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]"
				style={{ maxHeight: 560 }}
			>
				<svg
					height={height}
					role="img"
					style={{ display: "block" }}
					width={width}
				>
					<title>Ishikawa fishbone diagram</title>

					{/* Central spine */}
					<line
						stroke="var(--color-accent)"
						strokeWidth={2.5}
						x1={spine.x1}
						x2={spine.x2}
						y1={spine.y1}
						y2={spine.y2}
					/>

					{/* Effect / event head box on the right */}
					<g>
						<rect
							fill="var(--color-surface-elev)"
							height={head.h}
							rx={8}
							stroke="var(--color-accent)"
							strokeWidth={2}
							width={head.w}
							x={head.x}
							y={head.y}
						/>
						<circle
							cx={head.x + 16}
							cy={head.y + 16}
							fill="var(--color-danger)"
							r={4}
						/>
						<text
							fill="var(--color-text)"
							fontSize={12.5}
							fontWeight={600}
							x={head.x + head.w / 2}
							y={head.y + head.h / 2 + 4}
							textAnchor="middle"
						>
							{clampLabel(head.label, 28)}
						</text>
					</g>

					{/* Bones (first-level causes) with their twigs + measures */}
					{bones.map((bone) => {
						const stroke = STATUS_STROKE[bone.status];
						const dash = bone.status === "parked" ? "5 4" : undefined;
						const labelDy = bone.above ? -8 : 18;
						return (
							<g key={bone.id}>
								{/* Bone line */}
								<line
									stroke={stroke}
									strokeDasharray={dash}
									strokeWidth={2}
									x1={bone.x1}
									x2={bone.x2}
									y1={bone.y1}
									y2={bone.y2}
								/>
								{/* Category label at the bone tip */}
								<circle
									cx={bone.x2}
									cy={bone.y2}
									fill={STATUS_DOT[bone.status]}
									r={4}
								/>
								<text
									fill="var(--color-text)"
									fontSize={11.5}
									fontWeight={600}
									x={bone.x2}
									y={bone.y2 + labelDy}
									textAnchor="middle"
								>
									{clampLabel(bone.label, 22)}
								</text>

								{/* Category-level measures */}
								{bone.measures.map((m) => (
									<text
										fill="var(--color-muted)"
										fontSize={9.5}
										key={m.id}
										textAnchor="middle"
										x={m.x}
										y={m.y}
									>
										{m.stopClass ? `[${m.stopClass}] ` : ""}
										{clampLabel(m.label, 24)}
									</text>
								))}

								{/* Sub-cause twigs */}
								{bone.twigs.map((twig) => (
									<g key={twig.id}>
										<line
											stroke={STATUS_STROKE[twig.status]}
											strokeDasharray={
												twig.status === "parked" ? "4 3" : undefined
											}
											strokeWidth={1.5}
											x1={twig.x1}
											x2={twig.x2}
											y1={twig.y1}
											y2={twig.y2}
										/>
										<circle
											cx={twig.x1}
											cy={twig.y1}
											fill={STATUS_DOT[twig.status]}
											r={3}
										/>
										<text
											dominantBaseline="middle"
											fill="var(--color-text)"
											fontSize={10.5}
											textAnchor={twig.anchor}
											x={twig.labelX}
											y={twig.labelY}
										>
											{clampLabel(twig.label, 24)}
										</text>
										{twig.measures.map((m) => (
											<text
												dominantBaseline="middle"
												fill="var(--color-muted)"
												fontSize={9}
												key={m.id}
												textAnchor={twig.anchor}
												x={m.x}
												y={m.y}
											>
												{m.stopClass ? `[${m.stopClass}] ` : ""}
												{clampLabel(m.label, 22)}
											</text>
										))}
									</g>
								))}
							</g>
						);
					})}
				</svg>
			</div>
		</div>
	);
}
