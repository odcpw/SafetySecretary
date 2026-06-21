import { prisma, withTenantConnection } from "../db";
import {
	createEmailTransport,
	type TransactionalEmailAttachment,
	type TransactionalEmailMessage,
	type TransactionalEmailTransport,
} from "../email/transport";
import {
	generateIIReportPdf,
	iiReportFilename,
} from "../exports/ii/full-report";

type EnvLike = Pick<NodeJS.ProcessEnv, string>;

type OperatorNotificationConfig = {
	to: string;
	from: string;
	appBaseUrl: string | null;
};

type NotificationDeps = {
	env?: EnvLike;
	transport?: TransactionalEmailTransport;
	loadSharedContext?: (input: {
		tenantId: string;
		userId: string;
	}) => Promise<SharedContext>;
	loadCaseSummary?: (input: {
		tenantId: string;
		caseId: string;
	}) => Promise<CaseSummary | null>;
	generateCasePdf?: (input: {
		tenantId: string;
		userId: string;
		caseId: string;
	}) => Promise<TransactionalEmailAttachment>;
};

type SharedContext = {
	tenantName: string | null;
	workspaceKind: string | null;
	userEmail: string | null;
};

export type CaseSummary = {
	caseId: string;
	caseNumber: string | null;
	title: string | null;
	workflowStage?: string | null;
	createdAt?: Date | null;
	closedAt?: Date | null;
};

export function scheduleOperatorNotification(
	label: string,
	task: () => Promise<void>,
): void {
	void Promise.resolve()
		.then(task)
		.catch((error) => {
			console.warn(`Operator notification failed: ${label}.`, {
				error: errorMessage(error),
			});
		});
}

export async function notifyOperatorTenantAccess(
	input: {
		action: "created" | "joined";
		tenantId: string;
		userId: string;
		userEmail?: string | null;
		workspaceKind?: string | null;
	},
	deps: NotificationDeps = {},
): Promise<void> {
	const config = operatorNotificationConfig(deps.env ?? process.env);
	if (!config) {
		return;
	}

	const context = await loadSharedContextWithOverrides(input, deps);
	const actionLabel =
		input.action === "created" ? "Workspace created" : "Workspace joined";
	await sendOperatorEmail(
		{
			from: config.from,
			to: config.to,
			subject: `[Safety Secretary] ${actionLabel}: ${
				context.tenantName ?? input.tenantId
			}`,
			text: detailsText(actionLabel, {
				"Tenant": tenantLabel(context, input.tenantId),
				"Workspace kind": context.workspaceKind,
				"User": userLabel(context, input.userId),
				"Event time": new Date().toISOString(),
			}),
		},
		deps,
	);
}

export async function notifyOperatorCaseStarted(
	input: {
		tenantId: string;
		userId: string;
		caseId: string;
		summary?: CaseSummary;
	},
	deps: NotificationDeps = {},
): Promise<void> {
	const config = operatorNotificationConfig(deps.env ?? process.env);
	if (!config) {
		return;
	}

	const [context, summary] = await Promise.all([
		loadSharedContextWithOverrides(input, deps),
		resolveCaseSummary(input, deps),
	]);
	const caseLabel = formatCaseLabel(summary, input.caseId);
	const link = caseLink(config.appBaseUrl, input.caseId);

	await sendOperatorEmail(
		{
			from: config.from,
			to: config.to,
			subject: `[Safety Secretary] Case started: ${caseLabel}`,
			text: detailsText("Case started", {
				"Tenant": tenantLabel(context, input.tenantId),
				"User": userLabel(context, input.userId),
				"Case": caseLabel,
				"Case ID": input.caseId,
				"Workflow stage": summary?.workflowStage,
				"Created at": isoDate(summary?.createdAt),
				"Link": link,
				"Event time": new Date().toISOString(),
			}),
		},
		deps,
	);
}

export async function notifyOperatorCaseFinished(
	input: {
		tenantId: string;
		userId: string;
		caseId: string;
	},
	deps: NotificationDeps = {},
): Promise<void> {
	const config = operatorNotificationConfig(deps.env ?? process.env);
	if (!config) {
		return;
	}

	const [context, summary, pdfResult] = await Promise.all([
		loadSharedContextWithOverrides(input, deps),
		resolveCaseSummary(input, deps),
		resolveFinishedCasePdf(input, deps),
	]);
	const caseLabel = formatCaseLabel(summary, input.caseId);
	const link = caseLink(config.appBaseUrl, input.caseId);
	const attachments = pdfResult.attachment ? [pdfResult.attachment] : undefined;

	await sendOperatorEmail(
		{
			attachments,
			from: config.from,
			to: config.to,
			subject: `[Safety Secretary] Case finished: ${caseLabel}`,
			text: detailsText("Case finished", {
				"Tenant": tenantLabel(context, input.tenantId),
				"User": userLabel(context, input.userId),
				"Case": caseLabel,
				"Case ID": input.caseId,
				"Workflow stage": summary?.workflowStage,
				"Closed at": isoDate(summary?.closedAt),
				"Link": link,
				"PDF": pdfResult.attachment
					? "Attached"
					: `Not attached: ${pdfResult.error ?? "generation failed"}`,
				"Event time": new Date().toISOString(),
			}),
		},
		deps,
	);
}

function operatorNotificationConfig(
	env: EnvLike,
): OperatorNotificationConfig | null {
	const to = firstNonEmpty(
		env.SAFETYSECRETARY_OPERATOR_NOTIFICATION_EMAIL,
		env.SSFW_OPERATOR_NOTIFICATION_EMAIL,
		env.OPERATOR_NOTIFICATION_EMAIL,
	);
	if (!to) {
		return null;
	}

	return {
		to,
		from:
			firstNonEmpty(
				env.SAFETYSECRETARY_OPERATOR_NOTIFICATION_FROM,
				env.SSFW_OPERATOR_NOTIFICATION_FROM,
				env.EMAIL_FROM,
			) ??
			"no-reply@safetysecretary.local",
		appBaseUrl: firstNonEmpty(env.APP_BASE_URL) ?? null,
	};
}

async function sendOperatorEmail(
	input: Omit<TransactionalEmailMessage, "html" | "subject"> & {
		subject: string;
		text: string;
	},
	deps: NotificationDeps,
): Promise<void> {
	const transport = deps.transport ?? createEmailTransport(deps.env);
	await transport.sendTransactional({
		...input,
		html: textToHtml(input.text),
	});
}

async function loadSharedContextWithOverrides(
	input: {
		tenantId: string;
		userId: string;
		userEmail?: string | null;
		workspaceKind?: string | null;
	},
	deps: NotificationDeps,
): Promise<SharedContext> {
	const context = await (deps.loadSharedContext ?? loadSharedContext)(input);
	return {
		tenantName: context.tenantName,
		workspaceKind: input.workspaceKind ?? context.workspaceKind,
		userEmail: input.userEmail ?? context.userEmail,
	};
}

async function loadSharedContext(input: {
	tenantId: string;
	userId: string;
}): Promise<SharedContext> {
	const [tenant, user] = await Promise.all([
		prisma.tenant.findUnique({
			where: { id: input.tenantId },
			select: {
				name: true,
				workspaceKind: true,
			},
		}),
		prisma.user.findUnique({
			where: { id: input.userId },
			select: { email: true },
		}),
	]);

	return {
		tenantName: tenant?.name ?? null,
		workspaceKind: tenant?.workspaceKind ?? null,
		userEmail: user?.email ?? null,
	};
}

async function resolveCaseSummary(
	input: {
		tenantId: string;
		caseId: string;
		summary?: CaseSummary;
	},
	deps: NotificationDeps,
): Promise<CaseSummary | null> {
	if (input.summary) {
		return input.summary;
	}

	return (deps.loadCaseSummary ?? loadCaseSummary)(input);
}

async function loadCaseSummary(input: {
	tenantId: string;
	caseId: string;
}): Promise<CaseSummary | null> {
	const rows = await withTenantConnection(
		input.tenantId,
		async (tx) =>
			tx.$queryRaw<
				Array<{
					caseId: string;
					caseNumber: string | null;
					title: string | null;
					workflowStage: string | null;
					createdAt: Date | null;
					closedAt: Date | null;
				}>
			>`
			SELECT
				id::text AS "caseId",
				case_number AS "caseNumber",
				title,
				workflow_stage::text AS "workflowStage",
				created_at AS "createdAt",
				closed_at AS "closedAt"
			FROM incident_case
			WHERE id = ${input.caseId}::uuid
			LIMIT 1
		`,
	);

	return rows[0] ?? null;
}

async function resolveFinishedCasePdf(
	input: {
		tenantId: string;
		userId: string;
		caseId: string;
	},
	deps: NotificationDeps,
): Promise<{ attachment: TransactionalEmailAttachment | null; error?: string }> {
	try {
		return {
			attachment: await (deps.generateCasePdf ?? generateFinishedCasePdf)(
				input,
			),
		};
	} catch (error) {
		console.warn("Operator case PDF generation failed.", {
			caseId: input.caseId,
			error: errorMessage(error),
		});
		return { attachment: null, error: errorMessage(error) };
	}
}

async function generateFinishedCasePdf(input: {
	tenantId: string;
	userId: string;
	caseId: string;
}): Promise<TransactionalEmailAttachment> {
	const pdf = await generateIIReportPdf(
		{
			type: "draft",
			caseId: input.caseId,
			tenantId: input.tenantId,
		},
		{
			translationContext: {
				tenantId: input.tenantId,
				userId: input.userId,
				workflowId: input.caseId,
			},
		},
	);

	return {
		filename: iiReportFilename(input.caseId, "pdf"),
		contentType: "application/pdf",
		content: pdf.bytes,
	};
}

function detailsText(title: string, details: Record<string, string | null | undefined>): string {
	const lines = [title, ""];
	for (const [label, value] of Object.entries(details)) {
		if (value) {
			lines.push(`${label}: ${value}`);
		}
	}

	return lines.join("\n");
}

function tenantLabel(context: SharedContext, tenantId: string): string {
	return context.tenantName
		? `${context.tenantName} (${tenantId})`
		: tenantId;
}

function userLabel(context: SharedContext, userId: string): string {
	return context.userEmail ? `${context.userEmail} (${userId})` : userId;
}

function formatCaseLabel(
	summary: CaseSummary | null,
	caseId: string,
): string {
	const title = summary?.title?.trim();
	const caseNumber = summary?.caseNumber?.trim();

	if (caseNumber && title) {
		return `${caseNumber}: ${title}`;
	}

	return caseNumber || title || caseId;
}

function caseLink(appBaseUrl: string | null, caseId: string): string | null {
	if (!appBaseUrl) {
		return null;
	}

	try {
		return new URL(`/incidents/${caseId}`, appBaseUrl).toString();
	} catch {
		return null;
	}
}

function isoDate(value: Date | null | undefined): string | null {
	return value ? value.toISOString() : null;
}

function firstNonEmpty(...values: Array<string | undefined>): string | null {
	for (const value of values) {
		const trimmed = value?.trim();
		if (trimmed) {
			return trimmed;
		}
	}

	return null;
}

function textToHtml(text: string): string {
	return text
		.split("\n\n")
		.map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
		.join("");
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => {
		switch (character) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			default:
				return "&#39;";
		}
	});
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
