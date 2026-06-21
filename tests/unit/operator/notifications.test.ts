import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type {
	InvitationEmail,
	MagicLinkEmail,
	TransactionalEmailMessage,
	TransactionalEmailTransport,
} from "../../../src/lib/email/transport";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !isLocalImport(specifier)) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) =>
			existsSync(fileURLToPath(candidate)),
		);

		if (resolved) {
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
});

const notificationsModulePath = "../../../src/lib/operator/notifications.ts";
const {
	notifyOperatorCaseFinished,
	notifyOperatorCaseStarted,
	notifyOperatorTenantAccess,
} = (await import(
	notificationsModulePath
)) as typeof import("../../../src/lib/operator/notifications");

test("operator notifications are disabled when no recipient is configured", async () => {
	const transport = new RecordingTransactionalTransport();

	await notifyOperatorCaseStarted(
		{
			tenantId: "tenant-1",
			userId: "user-1",
			caseId: "case-1",
			summary: {
				caseId: "case-1",
				caseNumber: "II-2026-001",
				title: "Near miss",
			},
		},
		{
			env: {},
			transport,
			loadSharedContext: async () => ({
				tenantName: "Alpha Safety AG",
				workspaceKind: "company",
				userEmail: "alice@example.test",
			}),
		},
	);

	assert.equal(transport.messages.length, 0);
});

test("operator tenant access notification includes tenant and user context", async () => {
	const transport = new RecordingTransactionalTransport();

	await notifyOperatorTenantAccess(
		{
			action: "created",
			tenantId: "tenant-1",
			userId: "user-1",
			userEmail: "alice@example.test",
			workspaceKind: "company",
		},
		{
			env: {
				APP_BASE_URL: "https://safetysecretary.example.test",
				EMAIL_FROM: "Safety Secretary <no-reply@example.test>",
				SSFW_OPERATOR_NOTIFICATION_EMAIL: "oliver@decaro.ch",
			},
			transport,
			loadSharedContext: async () => ({
				tenantName: "Alpha Safety AG",
				workspaceKind: "company",
				userEmail: "ignored@example.test",
			}),
		},
	);

	assert.equal(transport.messages.length, 1);
	const message = transport.messages[0];
	assert.equal(message.to, "oliver@decaro.ch");
	assert.equal(message.from, "Safety Secretary <no-reply@example.test>");
	assert.equal(
		message.subject,
		"[Safety Secretary] Workspace created: Alpha Safety AG",
	);
	assert.match(message.text, /Tenant: Alpha Safety AG \(tenant-1\)/);
	assert.match(message.text, /User: alice@example.test \(user-1\)/);
	assert.match(message.text, /Workspace kind: company/);
});

test("operator finished-case notification attaches the generated PDF", async () => {
	const transport = new RecordingTransactionalTransport();

	await notifyOperatorCaseFinished(
		{
			tenantId: "tenant-1",
			userId: "user-1",
			caseId: "case-1",
		},
		{
			env: {
				APP_BASE_URL: "https://safetysecretary.example.test",
				EMAIL_FROM: "Safety Secretary <no-reply@example.test>",
				SSFW_OPERATOR_NOTIFICATION_EMAIL: "oliver@decaro.ch",
			},
			transport,
			loadSharedContext: async () => ({
				tenantName: "Alpha Safety AG",
				workspaceKind: "company",
				userEmail: "alice@example.test",
			}),
			loadCaseSummary: async () => ({
				caseId: "case-1",
				caseNumber: "II-2026-001",
				title: "Forklift near miss",
				workflowStage: "CLOSED",
				closedAt: new Date("2026-06-21T10:00:00.000Z"),
			}),
			generateCasePdf: async () => ({
				filename: "ii-full-report-case-1.pdf",
				contentType: "application/pdf",
				content: Buffer.from("%PDF test"),
			}),
		},
	);

	assert.equal(transport.messages.length, 1);
	const message = transport.messages[0];
	assert.equal(
		message.subject,
		"[Safety Secretary] Case finished: II-2026-001: Forklift near miss",
	);
	assert.match(
		message.text,
		/Link: https:\/\/safetysecretary\.example\.test\/incidents\/case-1/,
	);
	assert.match(message.text, /PDF: Attached/);
	assert.deepEqual(message.attachments, [
		{
			filename: "ii-full-report-case-1.pdf",
			contentType: "application/pdf",
			content: Buffer.from("%PDF test"),
		},
	]);
});

class RecordingTransactionalTransport implements TransactionalEmailTransport {
	readonly messages: TransactionalEmailMessage[] = [];

	async sendMagicLink(_email: MagicLinkEmail): Promise<void> {}

	async sendInvitation(_email: InvitationEmail): Promise<void> {}

	async sendTransactional(email: TransactionalEmailMessage): Promise<void> {
		this.messages.push(email);
	}
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}
