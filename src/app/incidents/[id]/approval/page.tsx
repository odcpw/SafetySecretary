import Link from "next/link";
import { CSRF_COOKIE_NAME } from "../../../../lib/auth/cookies";
import {
	type RouteSessionIdentity,
	resolveServerSession,
} from "../../../../lib/auth/route-session";
import { prisma, withTenantConnection } from "../../../../lib/db";
import { formatVersionLabel } from "../../../../lib/snapshots/approve";

type ApprovalPageProps = {
	params: Promise<{ id: string }> | { id: string };
	searchParams?:
		| Promise<Record<string, string | string[] | undefined>>
		| Record<string, string | string[] | undefined>;
};

type IncidentSummary = {
	id: string;
	title: string;
};

type ApprovalSnapshotSummary = {
	id: string;
	versionLabel: string;
	approvedBy: string;
	approvedAt: Date;
	schemaVersion: number;
	workflowData: unknown;
	artifactRefs: unknown;
	attachmentRefs: unknown;
};

type SnapshotPageData = {
	incident: IncidentSummary | null;
	snapshots: ApprovalSnapshotSummary[];
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const approveFormScript = `
(() => {
	const formSelector = "[data-safetysecretary-approval-form], [data-ssfw-approval-form]";
	const statusSelector = "[data-safetysecretary-approval-status], [data-ssfw-approval-status]";
	const csrfHeaderName = "x-safetysecretary-csrf";

	function readCookie(name) {
		const prefix = name + "=";
		const cookie = document.cookie
			.split(";")
			.map((value) => value.trim())
			.find((value) => value.startsWith(prefix));

		return cookie ? cookie.slice(prefix.length) : "";
	}

	function ensureCsrfToken(name) {
		const token =
			readCookie("__Host-safetysecretary_csrf") ||
			readCookie("__Host-ssfw_csrf") ||
			readCookie(name) ||
			readCookie("ssfw_csrf");

		if (!token) {
			throw new Error("Approval needs a valid CSRF token. Refresh and try again.");
		}

		return decodeURIComponent(token);
	}

	function setStatus(form, message) {
		const status = form.querySelector(statusSelector);

		if (!status) {
			return;
		}

		status.textContent = message;
		status.hidden = false;
	}

	document.querySelectorAll(formSelector).forEach((form) => {
		form.onsubmit = async (event) => {
			event.preventDefault();

			if (form.dataset.submitting === "true") {
				return;
			}

			const csrfCookieName = form.dataset.csrfCookie || "safetysecretary_csrf";
			let csrfToken = "";

			try {
				csrfToken = ensureCsrfToken(csrfCookieName);
			} catch (error) {
				setStatus(
					form,
					error instanceof Error
						? error.message
						: "Approval needs a valid CSRF token. Refresh and try again.",
				);
				return;
			}

			const submitButton = form.querySelector("button[type='submit']");

			if (submitButton) {
				submitButton.disabled = true;
			}
			form.dataset.submitting = "true";

			try {
				const response = await fetch(form.action, {
					method: "POST",
					credentials: "same-origin",
					headers: {
						accept: "application/json",
						[csrfHeaderName]: csrfToken,
					},
				});
				const payload = await response.json().catch(() => null);

				if (!response.ok) {
					throw new Error(
						payload?.message || "Incident approval snapshot could not be created.",
					);
				}

				const versionLabel = payload?.snapshot?.versionLabel;
				form.dispatchEvent(
					new CustomEvent("safetysecretary:approval-succeeded", {
						detail: { versionLabel },
					}),
				);
				form.dispatchEvent(
					new CustomEvent("ssfw:approval-succeeded", {
						detail: { versionLabel },
					}),
				);

				if (form.dataset.noRedirect === "true") {
					return;
				}

				const nextUrl = new URL(
					form.dataset.successUrl || window.location.href,
					window.location.href,
				);

				if (typeof versionLabel === "string" && versionLabel.length > 0) {
					nextUrl.searchParams.set("version", versionLabel);
				}

				window.location.assign(nextUrl.toString());
			} catch (error) {
				delete form.dataset.submitting;
				setStatus(
					form,
					error instanceof Error
						? error.message
						: "Incident approval snapshot could not be created.",
				);

				if (submitButton) {
					submitButton.disabled = false;
				}
			}
		};
	});
})();
`;

export default async function IncidentApprovalPage({
	params,
	searchParams,
}: ApprovalPageProps) {
	const { id: caseId } = await Promise.resolve(params);
	const resolvedSearchParams = await Promise.resolve(searchParams ?? {});

	if (!isUuid(caseId)) {
		return (
			<ApprovalShell title="Incident approval">
				<p style={mutedTextStyle}>Incident case id must be a UUID.</p>
			</ApprovalShell>
		);
	}

	const session = await resolveSession();

	if (!session) {
		return (
			<ApprovalShell title="Incident approval">
				<p style={mutedTextStyle}>Authentication required.</p>
			</ApprovalShell>
		);
	}

	const data = await loadApprovalPageData(session.tenantId, caseId);

	if (!data.incident) {
		return (
			<ApprovalShell title="Incident approval">
				<p style={mutedTextStyle}>Incident case was not found.</p>
			</ApprovalShell>
		);
	}

	const selectedSnapshot = selectSnapshot(
		data.snapshots,
		firstSearchValue(
			resolvedSearchParams.snapshot ?? resolvedSearchParams.version,
		),
	);
	const nextVersionLabel = formatVersionLabel(data.snapshots.length + 1);

	return (
		<ApprovalShell
			incidentId={caseId}
			title={data.incident.title}
			description="Create an immutable version of the current investigation. Later edits continue as the next draft."
		>
			<section style={toolbarStyle}>
				<form
					action={`/api/incidents/${caseId}/approve`}
					data-csrf-cookie={CSRF_COOKIE_NAME}
					data-safetysecretary-approval-form="true"
					data-success-url={`/incidents/${caseId}/approval`}
					method="post"
				>
					<button style={buttonStyle} type="submit">
						Approve as {nextVersionLabel}
					</button>
					<p
						data-safetysecretary-approval-status=""
						hidden
						style={errorTextStyle}
					/>
					<noscript>
						<p style={errorTextStyle}>
							Approving requires JavaScript so the CSRF header can be sent.
						</p>
					</noscript>
				</form>
				<script>{approveFormScript}</script>
				<p style={mutedTextStyle}>
					Approving freezes the investigation data, evidence references, and
					generated files linked to this version.
				</p>
			</section>

			<section aria-labelledby="snapshot-history-heading" style={sectionStyle}>
				<h2 id="snapshot-history-heading" style={headingStyle}>
					Past snapshots
				</h2>
				{data.snapshots.length === 0 ? (
					<p style={mutedTextStyle}>No snapshots yet.</p>
				) : (
					<ol style={listStyle}>
						{data.snapshots.map((snapshot) => (
							<li key={snapshot.id}>
								<Link
									aria-current={
										selectedSnapshot?.id === snapshot.id ? "page" : undefined
									}
									href={`/incidents/${caseId}/approval?version=${snapshot.versionLabel}`}
									style={linkStyle}
								>
									{snapshot.versionLabel}
								</Link>{" "}
								<span style={mutedTextStyle}>
									approved {formatDateTime(snapshot.approvedAt)}
								</span>
							</li>
						))}
					</ol>
				)}
			</section>

			{selectedSnapshot && (
				<section
					aria-labelledby="snapshot-readonly-heading"
					style={sectionStyle}
				>
					<h2 id="snapshot-readonly-heading" style={headingStyle}>
						{selectedSnapshot.versionLabel} read-only snapshot
					</h2>
					<dl style={metadataGridStyle}>
						<div>
							<dt style={termStyle}>Approved by</dt>
							<dd style={definitionStyle}>{selectedSnapshot.approvedBy}</dd>
						</div>
						<div>
							<dt style={termStyle}>Schema</dt>
							<dd style={definitionStyle}>v{selectedSnapshot.schemaVersion}</dd>
						</div>
						<div>
							<dt style={termStyle}>Attachments</dt>
							<dd style={definitionStyle}>
								{jsonArrayLength(selectedSnapshot.attachmentRefs)}
							</dd>
						</div>
						<div>
							<dt style={termStyle}>Artifacts</dt>
							<dd style={definitionStyle}>
								{jsonArrayLength(selectedSnapshot.artifactRefs)}
							</dd>
						</div>
					</dl>
					<SnapshotDigest snapshot={selectedSnapshot} />
					<details style={detailsStyle}>
						<summary style={summaryStyle}>Technical snapshot data</summary>
						<pre style={preStyle}>
							{JSON.stringify(
								{
									workflowData: selectedSnapshot.workflowData,
									attachmentRefs: selectedSnapshot.attachmentRefs,
									artifactRefs: selectedSnapshot.artifactRefs,
								},
								null,
								2,
							)}
						</pre>
					</details>
				</section>
			)}
		</ApprovalShell>
	);
}

async function resolveSession(): Promise<RouteSessionIdentity | null> {
	return resolveServerSession();
}

async function loadApprovalPageData(
	tenantId: string,
	caseId: string,
): Promise<SnapshotPageData> {
	const data = await withTenantConnection(tenantId, async (tx) => {
		const incidents = await tx.$queryRaw<IncidentSummary[]>`
			SELECT
				id::text AS id,
				title
			FROM incident_case
			WHERE id = ${caseId}::uuid
			LIMIT 1
		`;

		const snapshots = await tx.$queryRaw<ApprovalSnapshotSummary[]>`
			SELECT
				approval_snapshot.id::text AS id,
				approval_snapshot.version_label AS "versionLabel",
				approval_snapshot.approved_by::text AS "approvedBy",
				approval_snapshot.approved_at AS "approvedAt",
				approval_snapshot.schema_version AS "schemaVersion",
				approval_snapshot.workflow_data AS "workflowData",
				approval_snapshot.artifact_refs AS "artifactRefs",
				approval_snapshot.attachment_refs AS "attachmentRefs"
			FROM approval_snapshot
			WHERE workflow_type = 'II'::approval_workflow_type
				AND ii_case_id = ${caseId}::uuid
			ORDER BY approved_at DESC, version_label DESC, id DESC
		`;

		return {
			incident: incidents[0] ?? null,
			snapshots,
		};
	});

	const approverIds = Array.from(
		new Set(data.snapshots.map((snapshot) => snapshot.approvedBy)),
	);
	const approvers =
		approverIds.length > 0
			? await prisma.user.findMany({
					select: { email: true, id: true },
					where: { id: { in: approverIds } },
				})
			: [];
	const emailById = new Map(
		approvers.map((approver) => [approver.id, approver.email] as const),
	);

	return {
		incident: data.incident,
		snapshots: data.snapshots.map((snapshot) => ({
			...snapshot,
			approvedBy: emailById.get(snapshot.approvedBy) ?? snapshot.approvedBy,
		})),
	};
}

function selectSnapshot(
	snapshots: ApprovalSnapshotSummary[],
	selected: string | undefined,
): ApprovalSnapshotSummary | null {
	if (!selected) {
		return snapshots[0] ?? null;
	}

	return (
		snapshots.find(
			(snapshot) =>
				snapshot.versionLabel === selected ||
				snapshot.id === selected.toLowerCase(),
		) ??
		snapshots[0] ??
		null
	);
}

function firstSearchValue(
	value: string | string[] | undefined,
): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

function jsonArrayLength(value: unknown): number {
	return Array.isArray(value) ? value.length : 0;
}

function SnapshotDigest({ snapshot }: { snapshot: ApprovalSnapshotSummary }) {
	const digest = snapshotDigest(snapshot.workflowData);

	return (
		<section aria-label="Snapshot contents" style={digestStyle}>
			<div>
				<p style={termStyle}>Reference</p>
				<p style={definitionStyle}>{digest.caseNumber || "-"}</p>
			</div>
			<div>
				<p style={termStyle}>People / statements</p>
				<p style={definitionStyle}>
					{digest.persons} / {digest.accounts}
				</p>
			</div>
			<div>
				<p style={termStyle}>Timeline events</p>
				<p style={definitionStyle}>{digest.timelineEvents}</p>
			</div>
			<div>
				<p style={termStyle}>Cause nodes</p>
				<p style={definitionStyle}>{digest.causeNodes}</p>
			</div>
			<div>
				<p style={termStyle}>Actions</p>
				<p style={definitionStyle}>{digest.actions}</p>
			</div>
		</section>
	);
}

function snapshotDigest(workflowData: unknown): {
	accounts: number;
	actions: number;
	caseNumber: string | null;
	causeNodes: number;
	persons: number;
	timelineEvents: number;
} {
	const workflow = asRecord(workflowData);
	const incidentCase = asRecord(workflow.case);
	const causeNodes = arrayFrom(workflow.causeNodes);

	return {
		accounts: arrayFrom(workflow.accounts).length,
		actions: causeNodes.reduce<number>(
			(total, node) => total + arrayFrom(asRecord(node).actions).length,
			0,
		),
		caseNumber: stringOrNull(incidentCase.caseNumber),
		causeNodes: causeNodes.length,
		persons: arrayFrom(workflow.persons).length,
		timelineEvents: arrayFrom(workflow.timelineEvents).length,
	};
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function arrayFrom(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function stringOrNull(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value : null;
}

function formatDateTime(value: Date): string {
	return value.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}

function ApprovalShell({
	children,
	description,
	incidentId,
	title,
}: {
	children: React.ReactNode;
	description?: string;
	incidentId?: string;
	title: string;
}) {
	return (
		<main style={mainStyle}>
			<div style={contentStyle}>
				<nav style={navStyle}>
					<Link href="/incidents" style={navLinkStyle}>
						Incidents
					</Link>
					{incidentId ? (
						<>
							<span>/</span>
							<Link
								href={`/incidents/${incidentId}/coach`}
								style={navLinkStyle}
							>
								Investigation workbench
							</Link>
						</>
					) : null}
				</nav>
				<header style={headerStyle}>
					<h1 style={titleStyle}>{title}</h1>
					{description && <p style={mutedTextStyle}>{description}</p>}
				</header>
				{children}
			</div>
		</main>
	);
}

const mainStyle = {
	minHeight: "100vh",
	padding: "2rem",
	color: "var(--color-text)",
	fontFamily: "var(--font-sans)",
} satisfies React.CSSProperties;

const contentStyle = {
	display: "grid",
	gap: "1.25rem",
	margin: "0 auto",
	maxWidth: "64rem",
} satisfies React.CSSProperties;

const navStyle = {
	color: "var(--color-muted)",
	display: "flex",
	flexWrap: "wrap",
	fontSize: "var(--text-sm)",
	gap: "0.5rem",
} satisfies React.CSSProperties;

const navLinkStyle = {
	color: "var(--color-muted)",
	textDecoration: "none",
} satisfies React.CSSProperties;

const headerStyle = {
	display: "grid",
	gap: "0.375rem",
} satisfies React.CSSProperties;

const titleStyle = {
	fontSize: "var(--text-xl)",
	fontWeight: 500,
	margin: 0,
} satisfies React.CSSProperties;

const mutedTextStyle = {
	color: "var(--color-muted)",
	fontSize: "var(--text-sm)",
	margin: 0,
} satisfies React.CSSProperties;

const errorTextStyle = {
	...mutedTextStyle,
	color: "var(--color-danger, var(--color-accent))",
	marginTop: "0.5rem",
} satisfies React.CSSProperties;

const toolbarStyle = {
	alignItems: "center",
	border: "1px solid var(--color-border)",
	borderRadius: "0.5rem",
	display: "flex",
	flexWrap: "wrap",
	gap: "0.75rem",
	padding: "1rem",
} satisfies React.CSSProperties;

const buttonStyle = {
	background: "var(--color-accent)",
	border: "1px solid var(--color-accent)",
	borderRadius: "0.375rem",
	color: "var(--color-surface)",
	cursor: "pointer",
	font: "inherit",
	fontWeight: 500,
	minHeight: "2.5rem",
	padding: "0 0.875rem",
} satisfies React.CSSProperties;

const sectionStyle = {
	border: "1px solid var(--color-border)",
	borderRadius: "0.5rem",
	display: "grid",
	gap: "0.75rem",
	padding: "1rem",
} satisfies React.CSSProperties;

const headingStyle = {
	fontSize: "var(--text-lg)",
	fontWeight: 500,
	margin: 0,
} satisfies React.CSSProperties;

const listStyle = {
	display: "grid",
	gap: "0.5rem",
	margin: 0,
	paddingLeft: "1.25rem",
} satisfies React.CSSProperties;

const linkStyle = {
	color: "var(--color-accent)",
	fontWeight: 500,
} satisfies React.CSSProperties;

const metadataGridStyle = {
	display: "grid",
	gap: "0.75rem",
	gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
	margin: 0,
} satisfies React.CSSProperties;

const digestStyle = {
	...metadataGridStyle,
	borderTop: "1px solid var(--color-border)",
	paddingTop: "0.75rem",
} satisfies React.CSSProperties;

const detailsStyle = {
	display: "grid",
	gap: "0.75rem",
} satisfies React.CSSProperties;

const summaryStyle = {
	color: "var(--color-muted)",
	cursor: "pointer",
	fontSize: "var(--text-sm)",
} satisfies React.CSSProperties;

const termStyle = {
	color: "var(--color-muted)",
	fontSize: "var(--text-xs)",
	margin: 0,
} satisfies React.CSSProperties;

const definitionStyle = {
	fontSize: "var(--text-sm)",
	margin: "0.25rem 0 0",
	overflowWrap: "anywhere",
} satisfies React.CSSProperties;

const preStyle = {
	background: "var(--color-surface)",
	border: "1px solid var(--color-border)",
	borderRadius: "0.375rem",
	fontFamily: "var(--font-mono)",
	fontSize: "var(--text-xs)",
	margin: 0,
	maxHeight: "32rem",
	overflow: "auto",
	padding: "0.875rem",
	whiteSpace: "pre-wrap",
} satisfies React.CSSProperties;
