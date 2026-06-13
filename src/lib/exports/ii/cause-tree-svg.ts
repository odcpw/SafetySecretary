import {
	type LaidNode,
	type LaidNodeStatus,
	type LayoutInput,
	layoutCauseTree,
	NODE_H,
	NODE_W,
} from "../../incident/cause-tree-layout";

// Renders the cause tree to a standalone SVG string for the export (rasterised
// to PNG by LibreOffice in full-report.ts, then embedded on a landscape page).
// Uses the SHARED layout (cause-tree-layout.ts) so the report diagram matches
// the on-screen one. Print palette: white nodes on white, dark text, coloured
// borders — readable in a printed PDF, unlike the dark UI theme.

const PRINT: Record<
	LaidNodeStatus,
	{ border: string; dot: string; bold: boolean }
> = {
	event: { border: "#b91c1c", dot: "#b91c1c", bold: true },
	open: { border: "#cbd5e1", dot: "#94a3b8", bold: false },
	root: { border: "#2563eb", dot: "#2563eb", bold: false },
	parked: { border: "#94a3b8", dot: "#94a3b8", bold: false },
	treated: { border: "#059669", dot: "#059669", bold: false },
};
const MEASURE_COLOR = "#059669";
const TEXT_COLOR = "#111827";
const META_COLOR = "#6b7280";
const EDGE_COLOR = "#cbd5e1";

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** Greedy word-wrap to a character budget, clamped to maxLines with an ellipsis. */
function wrapLabel(
	label: string,
	maxChars: number,
	maxLines: number,
): string[] {
	const words = label.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = "";
	for (const word of words) {
		const candidate = line ? `${line} ${word}` : word;
		if (candidate.length > maxChars && line) {
			lines.push(line);
			line = word;
			if (lines.length === maxLines) {
				break;
			}
		} else {
			line = candidate;
		}
	}
	if (lines.length < maxLines && line) {
		lines.push(line);
	}
	if (lines.length === maxLines) {
		const used = lines.join(" ").split(/\s+/).length;
		if (used < words.length || lines[maxLines - 1].length > maxChars) {
			lines[maxLines - 1] =
				`${lines[maxLines - 1].slice(0, maxChars - 1).trimEnd()}…`;
		}
	}
	return lines;
}

function nodeSvg(n: LaidNode): string {
	const style = PRINT[n.status];
	const isMeasure = n.kind === "measure";
	const border = isMeasure ? MEASURE_COLOR : style.border;
	const dot = isMeasure ? MEASURE_COLOR : style.dot;
	const dash = n.status === "parked" ? ` stroke-dasharray="5 3"` : "";
	const textX = n.x + 26;
	const maxLines = n.meta ? 2 : 3;
	const lines = wrapLabel(n.label, 34, maxLines);
	const fontWeight = style.bold ? 600 : 400;

	const badge =
		isMeasure && n.stopClass
			? `<rect x="${n.x + 12}" y="${n.y + 12}" width="16" height="16" rx="3" fill="${MEASURE_COLOR}" /><text x="${n.x + 20}" y="${n.y + 24}" font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(n.stopClass)}</text>`
			: "";
	const labelX = isMeasure && n.stopClass ? n.x + 34 : textX;
	const tspans = lines
		.map(
			(ln, i) =>
				`<tspan x="${labelX}" dy="${i === 0 ? 0 : 14}">${escapeXml(ln)}</tspan>`,
		)
		.join("");
	const meta = n.meta
		? `<text x="${textX}" y="${n.y + NODE_H - 12}" font-size="9.5" fill="${META_COLOR}">${escapeXml(n.meta.length > 46 ? `${n.meta.slice(0, 45)}…` : n.meta)}</text>`
		: "";
	const dotCircle =
		isMeasure && n.stopClass
			? ""
			: `<circle cx="${n.x + 18}" cy="${n.y + 18}" r="4" fill="${dot}" />`;

	return [
		`<rect x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="8" fill="#ffffff" stroke="${border}" stroke-width="1.5"${dash} />`,
		badge,
		dotCircle,
		`<text x="${labelX}" y="${n.y + 22}" font-size="11.5" font-weight="${fontWeight}" fill="${TEXT_COLOR}">${tspans}</text>`,
		meta,
	].join("");
}

export function renderCauseTreeSvg(input: LayoutInput): {
	svg: string;
	width: number;
	height: number;
} {
	const { nodes, width, height } = layoutCauseTree({
		...input,
		collapsed: undefined,
	});
	const byId = new Map(nodes.map((n) => [n.id, n]));

	const edges = nodes
		.map((n) => {
			if (!n.parentId) {
				return "";
			}
			const p = byId.get(n.parentId);
			if (!p) {
				return "";
			}
			const x1 = p.x + NODE_W;
			const y1 = p.y + NODE_H / 2;
			const x2 = n.x;
			const y2 = n.y + NODE_H / 2;
			const mx = (x1 + x2) / 2;
			const stroke = n.kind === "measure" ? MEASURE_COLOR : EDGE_COLOR;
			return `<path d="M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="1.4" />`;
		})
		.join("");
	const body = nodes.map(nodeSvg).join("");

	const svg = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">`,
		`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />`,
		edges,
		body,
		"</svg>",
	].join("");
	return { svg, width, height };
}
