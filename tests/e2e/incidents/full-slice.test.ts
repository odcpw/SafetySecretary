import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import JSZip from "jszip";
import {
	dropTenantSchema,
	prisma,
	withTenantConnection,
} from "../../../src/lib/db";
import { II_COMMS_ONEPAGER_SECTIONS } from "../../../src/lib/exports/ii/comms-onepager";
import { II_FULL_REPORT_SECTIONS } from "../../../src/lib/exports/ii/full-report";
import { exportFooterText } from "../../../src/lib/legal/disclaimer";

test.skip(!process.env.DATABASE_URL, "DATABASE_URL is required");
test.describe.configure({ mode: "serial" });

const fiveWhysFixturePath = join(
	process.cwd(),
	"tests/fixtures/llm/ii-5whys.json",
);
const pngFixture = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
	"base64",
);

let appServer: ChildProcessWithoutNullStreams | null = null;
let appBaseUrl = "";
let emailLogPath = "";
let storageRoot = "";
let serverLog = "";

test.beforeAll(async () => {
	const port = await freePort();
	appBaseUrl = `http://127.0.0.1:${port}`;
	emailLogPath = join(
		process.cwd(),
		".tmp",
		`ssfw-mpk-magic-${process.pid}.jsonl`,
	);
	storageRoot = join(process.cwd(), ".tmp", `ssfw-mpk-storage-${process.pid}`);

	await rm(emailLogPath, { force: true });
	await rm(storageRoot, { force: true, recursive: true });
	await mkdir(storageRoot, { recursive: true });

	appServer = spawn(
		"pnpm",
		["dev", "--hostname", "127.0.0.1", "--port", String(port)],
		{
			cwd: process.cwd(),
			env: {
				...process.env,
				APP_BASE_URL: appBaseUrl,
				EMAIL_TRANSPORT: "dev",
				MAGIC_LINK_DEV_EMAIL_LOG: emailLogPath,
				NEXT_TELEMETRY_DISABLED: "1",
				NODE_ENV: "test",
				SSFW_II_5WHYS_MOCK_SEED_PATH: fiveWhysFixturePath,
				STORAGE_LOCAL_ROOT: storageRoot,
			},
		},
	);
	appServer.stdout.on("data", (chunk) => {
		serverLog += chunk.toString();
	});
	appServer.stderr.on("data", (chunk) => {
		serverLog += chunk.toString();
	});

	await waitForHttpOk(appBaseUrl);
});

test.afterAll(async () => {
	if (appServer) {
		if (appServer.exitCode === null && !appServer.killed) {
			appServer.kill("SIGTERM");
			await new Promise((resolve) => appServer?.once("exit", resolve));
		}
		appServer = null;
	}

	await prisma.$disconnect();
	await rm(emailLogPath, { force: true });
	await rm(storageRoot, { force: true, recursive: true });
});

test("II vertical slice happy path signs up, investigates, approves, and exports", async ({
	page,
}, testInfo) => {
	const runId = randomUUID();
	const email = `ssfw-mpk-${runId}@mpk-${runId}.example.invalid`;
	const fixture = await fiveWhysFixture();
	const tenant: { tenantId: string; userId: string } = {
		tenantId: "",
		userId: "",
	};

	try {
		await page.goto(`${appBaseUrl}/signin`);
		await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
		await page.locator('input[name="email"]').fill(email);
		await page.getByRole("button", { name: "Send sign-in link" }).click();
		await expect(
			page.getByText("Check your email for a sign-in link."),
		).toBeVisible();
		await screenshot(page, testInfo, "01-signin-link");

		const magicLinkUrl = await readMagicLinkUrl(email);
		await page.goto(magicLinkUrl);
		await page.getByRole("button", { name: "Sign in" }).click();
		await expect(page).toHaveURL(/\/disclaimer\?/);
		const signedInTenant = await lookupTenantForEmail(email);
		tenant.tenantId = signedInTenant.tenantId;
		tenant.userId = signedInTenant.userId;

		await page.locator('input[name="acknowledge"]').check();
		await page.getByRole("button", { name: "Continue" }).click();
		await expect(page).toHaveURL(/\/incidents$/);
		await screenshot(page, testInfo, "02-disclaimer-accepted");

		await createIncident(page);
		const incidentId = incidentIdFromUrl(page.url());
		await updateIncidentBasics(page, incidentId);
		await page.goto(`${appBaseUrl}/incidents/${incidentId}/coach`);
		await expect(page.getByText("Mixer guard bypass near miss")).toBeVisible();
		await screenshot(page, testInfo, "03-incident-created");

		await addPerson(page, incidentId, {
			name: "Anna Witness",
			otherInfo: "Saw the guard open before the stop.",
			role: "witness",
			yearsWithCompany: "4",
		});
		await addPerson(page, incidentId, {
			name: "Ben Supervisor",
			otherInfo: "Supervisor for the late shift.",
			role: "supervisor",
		});
		await screenshot(page, testInfo, "04-persons");

		const firstEvent = await addTimelineEvent(page, incidentId, {
			confidence: "LIKELY",
			eventAt: "2026-05-05T07:10",
			text: fixture.entries[0].parentStatement,
			timeLabel: "Before",
		});
		await addTimelineEvent(page, incidentId, {
			confidence: "CONFIRMED",
			eventAt: "2026-05-05T07:20",
			text: "The supervisor stopped the line and isolated the mixer.",
			timeLabel: "Event",
		});
		await attachTimelinePhoto(page, incidentId, firstEvent.id);
		await screenshot(page, testInfo, "05-timeline-photo");

		const firstCause = await addCauseNode(page, incidentId, {
			statement: fixture.entries[0].userAnswer,
			timelineEventId: firstEvent.id,
		});
		const secondCause = await addCauseNode(page, incidentId, {
			parentId: firstCause.id,
			statement: fixture.entries[1].userAnswer,
		});
		const rootCause = await addCauseNode(page, incidentId, {
			parentId: secondCause.id,
			statement: fixture.entries[2].userAnswer,
		});
		await markRootCause(
			page,
			incidentId,
			rootCause.id,
			fixture.entries[2].userAnswer,
		);
		await screenshot(page, testInfo, "06-five-whys");

		await addCorrectiveAction(page, incidentId, {
			causeNodeId: rootCause.id,
			description: "Create escalation path for cancelled maintenance windows.",
			dueDate: "2026-05-22",
			ownerRole: "Maintenance planner",
		});
		await screenshot(page, testInfo, "07-actions");

		await recordHiraFollowup(page, incidentId);
		await screenshot(page, testInfo, "08-hira-followup");

		await reviewInvestigationWorkbench(page, incidentId);
		await screenshot(page, testInfo, "09-investigation-workbench");

		await approveV01(page, incidentId);
		await screenshot(page, testInfo, "10-approval-v01");

		const fullReport = await downloadBytes(
			page,
			`${appBaseUrl}/api/incidents/${incidentId}/export?report=full-report&format=docx&locale=en`,
		);
		const fullReportText = await docxText(fullReport);
		for (const section of II_FULL_REPORT_SECTIONS) {
			expect(fullReportText).toContain(section);
		}
		expect(fullReportText).toContain(exportFooterText("en"));

		const comms = await downloadBytes(
			page,
			`${appBaseUrl}/api/incidents/${incidentId}/export?report=comms&format=docx&locale=en`,
		);
		const commsText = await docxText(comms);
		const commsMedia = await docxMedia(comms);
		for (const section of II_COMMS_ONEPAGER_SECTIONS) {
			expect(commsText).toContain(section);
		}
		expect(commsMedia.length).toBeGreaterThan(0);

		const inspection = await inspectTenantData(tenant.tenantId, incidentId);
		expect(inspection).toMatchObject({
			actionCount: 1,
			attachmentCount: 1,
			causeCount: 3,
			incidentCount: 1,
			personCount: 2,
			snapshotCount: 1,
			timelineCount: 2,
			visionAuditCount: 0,
		});
		console.log(
			`DB/storage inspection ssfw-mpk: ${JSON.stringify(inspection)}`,
		);
	} finally {
		if (tenant.tenantId) {
			await cleanupTenant({ ...tenant, email });
		}
	}
});

async function createIncident(page: Page): Promise<void> {
	await page.goto(`${appBaseUrl}/incidents`);
	await page.getByRole("button", { name: "New incident" }).click();
	await expect(page).toHaveURL(/\/incidents\/[0-9a-f-]{36}\/coach$/);
}

async function updateIncidentBasics(
	page: Page,
	incidentId: string,
): Promise<void> {
	await apiForm(page, `/api/incidents/${incidentId}`, {
		actualInjuryOutcome: "FIRST_AID",
		actualSeverityCode: "A",
		bodyPart: "Left hand",
		contentLanguage: "en",
		coordinatorName: "Claire Coordinator",
		coordinatorRole: "Safety lead",
		departmentText: "Packing",
		hazardCategoryCode: "MECHANICAL",
		incidentAt: "2026-05-05T07:10",
		incidentTimeZone: "europe/zurich",
		incidentType: "ACCIDENT",
		injuryNature: "Bruise",
		location: "Line 2 packing area",
		lostDays: "0",
		potentialLikelihoodCode: "3",
		potentialOutcomeText: "A worker could have been caught by the mixer guard.",
		potentialSeverityCode: "B",
		title: "Mixer guard bypass near miss",
		workActivity: "Clearing the mixer guard",
	});
}

async function addPerson(
	page: Page,
	incidentId: string,
	input: {
		name: string;
		otherInfo: string;
		role: string;
		yearsWithCompany?: string;
	},
): Promise<void> {
	await apiForm(page, `/api/incidents/${incidentId}/persons`, {
		name: input.name,
		otherInfo: input.otherInfo,
		role: input.role,
		...(input.yearsWithCompany
			? { yearsWithCompany: input.yearsWithCompany }
			: {}),
	});
	await page.goto(`${appBaseUrl}/incidents/${incidentId}/coach`);
	await expect(page.getByText(input.name)).toBeVisible();
}

async function addTimelineEvent(
	page: Page,
	incidentId: string,
	input: {
		confidence: string;
		eventAt: string;
		text: string;
		timeLabel: string;
	},
): Promise<{ id: string }> {
	const payload = await apiForm(page, `/api/incidents/${incidentId}/timeline`, {
		confidence: input.confidence,
		eventAt: input.eventAt,
		text: input.text,
		timeLabel: input.timeLabel,
	});
	const eventId = stringFromPayload(payload, ["event", "id"]);
	return { id: eventId };
}

async function attachTimelinePhoto(
	page: Page,
	incidentId: string,
	eventId: string,
): Promise<void> {
	await apiMultipart(
		page,
		`/api/incidents/${incidentId}/timeline/${eventId}/photos`,
		{
			file: {
				bytesBase64: pngFixture.toString("base64"),
				mimeType: "image/png",
				name: "synthetic-guard.png",
			},
		},
	);
}

async function addCauseNode(
	page: Page,
	incidentId: string,
	input: {
		parentId?: string;
		statement: string;
		timelineEventId?: string;
	},
): Promise<{ id: string }> {
	const payload = await apiForm(page, `/api/incidents/${incidentId}/causes`, {
		parentId: input.parentId ?? "",
		statement: input.statement,
		timelineEventId: input.timelineEventId ?? "",
	});
	const nodeId = stringFromPayload(payload, ["node", "id"]);
	return { id: nodeId };
}

async function markRootCause(
	page: Page,
	incidentId: string,
	nodeId: string,
	statement: string,
): Promise<void> {
	await apiForm(page, `/api/incidents/${incidentId}/causes`, {
		_action: "update",
		isRootCause: "on",
		nodeId,
		statement,
	});
}

async function addCorrectiveAction(
	page: Page,
	incidentId: string,
	input: {
		causeNodeId: string;
		description: string;
		dueDate: string;
		ownerRole: string;
	},
): Promise<void> {
	await apiForm(page, `/api/incidents/${incidentId}/actions`, {
		actionType: "ORGANIZATIONAL",
		causeNodeId: input.causeNodeId,
		description: input.description,
		dueDate: input.dueDate,
		ownerRole: input.ownerRole,
		status: "OPEN",
	});
}

async function recordHiraFollowup(
	page: Page,
	incidentId: string,
): Promise<void> {
	await apiForm(page, `/api/incidents/${incidentId}/hira-followup`, {
		hiraFollowupNeeded: "on",
		hiraFollowupText: "Follow up the HIRA for the mixer guarding task.",
	});
}

async function reviewInvestigationWorkbench(
	page: Page,
	incidentId: string,
): Promise<void> {
	await page.goto(`${appBaseUrl}/incidents/${incidentId}/coach`);
	await expect(
		page.getByRole("heading", { name: "Mixer guard bypass near miss" }),
	).toBeVisible();
	await expect(page.getByText("Incident investigation").first()).toBeVisible();
	await expect(
		page
			.getByText("Create escalation path for cancelled maintenance windows.")
			.first(),
	).toBeAttached();
	await expect(
		page.getByText("Follow up the HIRA for the mixer guarding task.").first(),
	).toBeAttached();
}

async function approveV01(page: Page, incidentId: string): Promise<void> {
	await page.goto(`${appBaseUrl}/incidents/${incidentId}/approval`);
	await submitNavigating(page, () =>
		page.getByRole("button", { name: /Approve as v01/ }).click(),
	);
	await expect(page.getByText("v01", { exact: true }).first()).toBeVisible();
}

async function submitNavigating(
	page: Page,
	click: () => Promise<unknown>,
): Promise<void> {
	const navigation = page
		.waitForNavigation({ timeout: 7_500, waitUntil: "networkidle" })
		.catch(() => null);
	await click();
	await navigation;
	await page.waitForLoadState("networkidle").catch(() => undefined);
	await page.waitForTimeout(150);
}

async function downloadBytes(page: Page, url: string): Promise<Buffer> {
	const payload = await page.evaluate(async (downloadUrl) => {
		const response = await fetch(downloadUrl, { credentials: "same-origin" });
		const contentType = response.headers.get("content-type") ?? "";
		const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));

		return {
			bytes,
			contentType,
			status: response.status,
		};
	}, url);
	expect(payload.status).toBe(200);
	expect(payload.contentType).toContain(
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	);
	return Buffer.from(payload.bytes);
}

async function screenshot(
	page: Page,
	testInfo: TestInfo,
	name: string,
): Promise<void> {
	const evidenceDir =
		process.env.SSFW_E2E_EVIDENCE_DIR ?? testInfo.outputPath("screenshots");
	await mkdir(evidenceDir, { recursive: true });
	await page.screenshot({
		fullPage: true,
		path: join(evidenceDir, `${name}.png`),
	});
}

async function fiveWhysFixture(): Promise<{
	entries: Array<{
		parentStatement: string;
		responseText: string;
		userAnswer: string;
	}>;
}> {
	return JSON.parse(await readFile(fiveWhysFixturePath, "utf8"));
}

async function readMagicLinkUrl(email: string): Promise<string> {
	const deadline = Date.now() + 15_000;

	while (Date.now() < deadline) {
		const lines = await readFile(emailLogPath, "utf8")
			.then((value) => value.trim().split("\n").filter(Boolean))
			.catch(() => []);
		const payloads = lines
			.map((line) => JSON.parse(line) as { magicLinkUrl?: string; to?: string })
			.filter((payload) => payload.to === email && payload.magicLinkUrl);
		const latest = payloads.at(-1);

		if (latest?.magicLinkUrl) {
			return latest.magicLinkUrl;
		}

		await delay(100);
	}

	throw new Error(`Magic link for ${email} was not written to ${emailLogPath}`);
}

async function apiForm(
	page: Page,
	url: string,
	fields: Record<string, string>,
): Promise<unknown> {
	const response = await page.request.post(absoluteApiUrl(url), {
		data: fields,
		headers: {
			accept: "application/json",
			"x-ssfw-csrf": await csrfTokenFromPage(page),
		},
	});
	const text = await response.text();

	if (!response.ok()) {
		throw new Error(`API ${url} failed with ${response.status()}: ${text}`);
	}

	return text ? (JSON.parse(text) as unknown) : null;
}

async function apiMultipart(
	page: Page,
	url: string,
	input: {
		file: {
			bytesBase64: string;
			mimeType: string;
			name: string;
		};
	},
): Promise<unknown> {
	const response = await page.request.post(absoluteApiUrl(url), {
		headers: {
			accept: "application/json",
			"x-ssfw-csrf": await csrfTokenFromPage(page),
		},
		maxRedirects: 0,
		multipart: {
			file: {
				buffer: Buffer.from(input.file.bytesBase64, "base64"),
				mimeType: input.file.mimeType,
				name: input.file.name,
			},
		},
	});
	const text = await response.text();

	if ([302, 303].includes(response.status())) {
		return null;
	}

	if (!response.ok()) {
		throw new Error(`API ${url} failed with ${response.status()}: ${text}`);
	}

	return text ? (JSON.parse(text) as unknown) : null;
}

async function csrfTokenFromPage(page: Page): Promise<string> {
	const token = await page.evaluate(() => {
		const readCookie = (name: string): string | null => {
			const prefix = `${name}=`;
			const match = document.cookie
				.split(";")
				.map((part) => part.trim())
				.find((part) => part.startsWith(prefix));

			return match ? decodeURIComponent(match.slice(prefix.length)) : null;
		};

		return readCookie("__Host-ssfw_csrf") ?? readCookie("ssfw_csrf");
	});

	if (!token) {
		throw new Error("CSRF cookie is missing.");
	}

	return token;
}

function absoluteApiUrl(url: string): string {
	return new URL(url, appBaseUrl).toString();
}

function stringFromPayload(payload: unknown, path: string[]): string {
	let value = payload;

	for (const segment of path) {
		if (typeof value !== "object" || value === null || !(segment in value)) {
			throw new Error(`Response payload is missing ${path.join(".")}.`);
		}

		value = (value as Record<string, unknown>)[segment];
	}

	if (typeof value !== "string" || !value) {
		throw new Error(
			`Response payload field ${path.join(".")} is not a string.`,
		);
	}

	return value;
}

async function lookupTenantForEmail(email: string): Promise<{
	tenantId: string;
	userId: string;
}> {
	const user = await prisma.user.findUnique({
		where: { email },
		select: {
			id: true,
			memberships: {
				orderBy: { createdAt: "asc" },
				select: { tenantId: true },
			},
		},
	});
	const tenantId = user?.memberships[0]?.tenantId;

	if (!user || !tenantId) {
		throw new Error(`Signed-in test user ${email} has no tenant membership.`);
	}

	return {
		tenantId,
		userId: user.id,
	};
}

async function docxText(docx: Buffer): Promise<string> {
	const zip = await JSZip.loadAsync(docx);
	const documentXml = await zip.file("word/document.xml")?.async("string");
	const footerXml = await Promise.all(
		Object.keys(zip.files)
			.filter((fileName) => /^word\/footer\d+\.xml$/.test(fileName))
			.map((fileName) => zip.file(fileName)?.async("string")),
	);
	return `${xmlText(documentXml ?? "")} ${footerXml.map((xml) => xmlText(xml ?? "")).join(" ")}`;
}

async function docxMedia(docx: Buffer): Promise<Buffer[]> {
	const zip = await JSZip.loadAsync(docx);
	return Promise.all(
		Object.keys(zip.files)
			.filter(
				(fileName) =>
					fileName.startsWith("word/media/") && !zip.files[fileName]?.dir,
			)
			.map(async (fileName) =>
				Buffer.from(await zip.file(fileName)!.async("uint8array")),
			),
	);
}

function xmlText(xml: string): string {
	return xml
		.replace(/<[^>]+>/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}

async function inspectTenantData(
	tenantId: string,
	incidentId: string,
): Promise<{
	actionCount: number;
	attachmentCount: number;
	causeCount: number;
	incidentCount: number;
	personCount: number;
	snapshotCount: number;
	timelineCount: number;
	visionAuditCount: number;
}> {
	return withTenantConnection(tenantId, async (tx) => {
		const [counts] = await tx.$queryRaw<
			Array<{
				actionCount: bigint;
				attachmentCount: bigint;
				causeCount: bigint;
				incidentCount: bigint;
				personCount: bigint;
				snapshotCount: bigint;
				timelineCount: bigint;
			}>
		>`
			SELECT
				(SELECT count(*) FROM incident_case WHERE id = ${incidentId}::uuid) AS "incidentCount",
				(SELECT count(*) FROM incident_person WHERE case_id = ${incidentId}::uuid) AS "personCount",
				(SELECT count(*) FROM incident_timeline_event WHERE case_id = ${incidentId}::uuid) AS "timelineCount",
				(SELECT count(*)
					FROM incident_attachment attachment
					JOIN incident_timeline_event event ON event.id = attachment.event_id
					WHERE event.case_id = ${incidentId}::uuid) AS "attachmentCount",
				(SELECT count(*) FROM incident_cause_node WHERE case_id = ${incidentId}::uuid) AS "causeCount",
				(SELECT count(*) FROM incident_cause_action action
					JOIN incident_cause_node cause ON cause.id = action.cause_node_id
					WHERE cause.case_id = ${incidentId}::uuid) AS "actionCount",
				(SELECT count(*) FROM approval_snapshot WHERE ii_case_id = ${incidentId}::uuid) AS "snapshotCount"
		`;
		const [visionAudit] = await tx.$queryRaw<Array<{ count: bigint }>>`
			SELECT count(*) AS count
			FROM vision_call_audit
			WHERE workflow_id = ${incidentId}::uuid
		`;

		return {
			actionCount: Number(counts?.actionCount ?? 0),
			attachmentCount: Number(counts?.attachmentCount ?? 0),
			causeCount: Number(counts?.causeCount ?? 0),
			incidentCount: Number(counts?.incidentCount ?? 0),
			personCount: Number(counts?.personCount ?? 0),
			snapshotCount: Number(counts?.snapshotCount ?? 0),
			timelineCount: Number(counts?.timelineCount ?? 0),
			visionAuditCount: Number(visionAudit?.count ?? 0),
		};
	});
}

async function cleanupTenant(input: {
	email: string;
	tenantId: string;
	userId: string;
}): Promise<void> {
	await dropTenantSchema(input.tenantId).catch(() => undefined);
	await prisma.tenantMembership.deleteMany({
		where: { tenantId: input.tenantId },
	});
	await prisma.session.deleteMany({ where: { tenantId: input.tenantId } });
	await prisma.magicLinkToken.deleteMany({
		where: { email: input.email },
	});
	await prisma.userAcknowledgement.deleteMany({
		where: { userId: input.userId },
	});
	await prisma.tenant.deleteMany({ where: { id: input.tenantId } });
	await prisma.user.deleteMany({ where: { id: input.userId } });
}

function incidentIdFromUrl(url: string): string {
	const match = /\/incidents\/([0-9a-f-]{36})(?:$|[/?#])/.exec(url);

	if (!match?.[1]) {
		throw new Error(`Could not parse incident id from ${url}`);
	}

	return match[1];
}

async function waitForHttpOk(url: string): Promise<void> {
	const deadline = Date.now() + 45_000;
	let lastError = "";

	while (Date.now() < deadline) {
		if (appServer?.exitCode !== null) {
			throw new Error(`Next dev server exited early.\n${serverLog}`);
		}

		try {
			const response = await fetch(url);
			if (response.ok) {
				return;
			}
			lastError = `${response.status} ${response.statusText}`;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}

		await delay(250);
	}

	throw new Error(
		`Next dev server at ${url} did not become ready: ${lastError}\n${serverLog}`,
	);
}

async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close(() => reject(new Error("Could not allocate a free port")));
				return;
			}
			server.close(() => resolve(address.port));
		});
	});
}

async function delay(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}
