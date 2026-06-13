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
	const email = `ssfw-mpk-${runId}@example.invalid`;
	const fixture = await fiveWhysFixture();
	const tenant: { tenantId: string; userId: string } = {
		tenantId: "",
		userId: "",
	};

	try {
		await page.goto(`${appBaseUrl}/signup`);
		await expect(
			page.getByRole("heading", { name: "Create workspace" }),
		).toBeVisible();
		await page.locator('input[name="email"]').fill(email);
		await page.locator('input[name="companyName"]').fill(`SSFW MPK ${runId}`);
		await page.locator('select[name="defaultLanguage"]').selectOption("fr");
		await page.getByRole("button", { name: "Create workspace" }).click();
		await expect(
			page.getByText("Workspace created. Check your email for a sign-in link."),
		).toBeVisible();
		await screenshot(page, testInfo, "01-signup");

		const magicLinkUrl = await readMagicLinkUrl(email);
		const verifyResponse = await page.goto(magicLinkUrl);
		expect(verifyResponse?.ok()).toBe(true);
		const verifyPayload = JSON.parse(
			await page.locator("body").innerText(),
		) as {
			tenantId: string;
			userId: string;
		};
		tenant.tenantId = verifyPayload.tenantId;
		tenant.userId = verifyPayload.userId;

		await page.goto(`${appBaseUrl}/incidents/new`);
		await expect(page).toHaveURL(/\/disclaimer\?/);
		await page.locator('input[name="acknowledge"]').check();
		await page.getByRole("button", { name: "Continue" }).click();
		await expect(page).toHaveURL(/\/incidents\/new$/);
		await screenshot(page, testInfo, "02-disclaimer-accepted");

		await createIncident(page);
		const incidentId = incidentIdFromUrl(page.url());
		await expect(page.getByText("Mixer guard bypass near miss")).toBeVisible();
		await screenshot(page, testInfo, "03-incident-created");
		await editIncidentBasics(page, incidentId);

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
		await savePersonAccount(page, incidentId, "Anna Witness");
		await screenshot(page, testInfo, "04-persons");

		await addTimelineEvent(page, incidentId, {
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
		await attachTimelinePhoto(page, fixture.entries[0].parentStatement);
		await screenshot(page, testInfo, "05-timeline-photo");

		await addFiveWhysTurn(page, incidentId, {
			answer: fixture.entries[0].userAnswer,
			timelineOptionIndex: 1,
		});
		await addFiveWhysTurn(page, incidentId, {
			answer: fixture.entries[1].userAnswer,
			parentStatement: fixture.entries[0].userAnswer,
		});
		await addFiveWhysTurn(page, incidentId, {
			answer: fixture.entries[2].userAnswer,
			parentStatement: fixture.entries[1].userAnswer,
		});
		await markRootCause(page, fixture.entries[2].userAnswer);
		await screenshot(page, testInfo, "06-five-whys");

		await addCorrectiveAction(page, incidentId, {
			causeStatement: fixture.entries[2].userAnswer,
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
			`${appBaseUrl}/incidents/${incidentId}/exports/full-report?format=docx&locale=en`,
		);
		const fullReportText = await docxText(fullReport);
		for (const section of II_FULL_REPORT_SECTIONS) {
			expect(fullReportText).toContain(section);
		}
		expect(fullReportText).toContain(exportFooterText("en"));

		const comms = await downloadBytes(
			page,
			`${appBaseUrl}/incidents/${incidentId}/exports/comms?format=docx&locale=en`,
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
	await page.goto(`${appBaseUrl}/incidents/new`);
	await waitForCsrfFormHandler(page);
	await page
		.locator('input[name="title"]')
		.fill("Mixer guard bypass near miss");
	await page.locator('select[name="contentLanguage"]').selectOption("fr");
	await page.locator('input[name="incidentAt"]').fill("2026-05-05T07:10");
	await page
		.locator('select[name="incidentTimeZone"]')
		.selectOption("europe/zurich");
	await page.locator('select[name="incidentType"]').selectOption("NEAR_MISS");
	await page
		.locator('textarea[name="potentialOutcomeText"]')
		.fill("A worker could have been caught by the mixer guard.");
	await page.locator('select[name="potentialSeverityCode"]').selectOption("B");
	await page
		.locator('select[name="potentialLikelihoodCode"]')
		.selectOption("3");
	await page.locator('input[name="location"]').fill("Line 2 packing area");
	await page.locator('input[name="coordinatorRole"]').fill("Safety lead");
	await page
		.locator('input[name="coordinatorName"]')
		.fill("Claire Coordinator");
	await submitNavigating(page, () =>
		page.locator('form[action="/api/incidents"] button[type="submit"]').click(),
	);
	await expect(page).toHaveURL(/\/incidents\/[0-9a-f-]{36}\/coach$/);
	await page.goto(
		`${appBaseUrl}/incidents/${incidentIdFromUrl(page.url())}/investigation`,
	);
}

async function editIncidentBasics(
	page: Page,
	incidentId: string,
): Promise<void> {
	await page.goto(`${appBaseUrl}/incidents/${incidentId}/edit`);
	await waitForCsrfFormHandler(page);
	await page.locator('select[name="incidentType"]').selectOption("ACCIDENT");
	await page
		.locator('select[name="actualInjuryOutcome"]')
		.selectOption("FIRST_AID");
	await page.locator('input[name="departmentText"]').fill("Packing");
	await page
		.locator('select[name="hazardCategoryCode"]')
		.selectOption("MECHANICAL");
	await page
		.locator('input[name="workActivity"]')
		.fill("Clearing the mixer guard");
	await page.locator('input[name="injuryNature"]').fill("Bruise");
	await page.locator('input[name="bodyPart"]').fill("Left hand");
	await page.locator('input[name="lostDays"]').fill("0");
	await submitNavigating(page, () =>
		page
			.locator(
				`form[action="/api/incidents/${incidentId}"] button[type="submit"]`,
			)
			.click(),
	);
	await expect(page).toHaveURL(new RegExp(`/incidents/${incidentId}$`));
	await expect(page.getByText("Accident - First aid").first()).toBeVisible();
	await expect(page.getByText("Packing", { exact: true })).toBeVisible();
	await expect(page.getByText("Clearing the mixer guard")).toBeVisible();
	await expect(page.getByText("Bruise")).toBeVisible();
	await expect(page.getByText("Left hand")).toBeVisible();
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
	await page.goto(`${appBaseUrl}/incidents/${incidentId}/persons`);
	await waitForCsrfFormHandler(page);
	const form = page
		.locator(`form[action="/api/incidents/${incidentId}/persons"]`)
		.first();
	await form.locator('select[name="role"]').selectOption(input.role);
	await form.locator('input[name="name"]').fill(input.name);
	if (input.yearsWithCompany) {
		await form.locator("summary").click();
		await form
			.locator('input[name="yearsWithCompany"]')
			.fill(input.yearsWithCompany);
	}
	await form.locator('textarea[name="otherInfo"]').fill(input.otherInfo);
	await submitNavigating(page, () =>
		form.locator('button[type="submit"]').first().click(),
	);
	await expect(page.getByText(input.name)).toBeVisible();
}

async function savePersonAccount(
	page: Page,
	incidentId: string,
	personName: string,
): Promise<void> {
	await page.goto(`${appBaseUrl}/incidents/${incidentId}/persons`);
	const person = page
		.locator("article")
		.filter({ hasText: personName })
		.first();
	await person.getByRole("link", { name: "Statement" }).click();
	await waitForCsrfFormHandler(page);
	await page
		.locator('textarea[name="rawStatement"]')
		.fill("I saw the guard open before the stop.");
	await submitNavigating(page, () =>
		page.locator('button[type="submit"]').first().click(),
	);
	await expect(page).toHaveURL(new RegExp(`/incidents/${incidentId}/persons$`));
	await person.getByRole("link", { name: "Statement" }).click();
	await expect(page.locator('textarea[name="rawStatement"]')).toHaveValue(
		"I saw the guard open before the stop.",
	);
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
): Promise<void> {
	await page.goto(`${appBaseUrl}/incidents/${incidentId}/timeline`);
	const form = page.locator("form[data-ssfw-timeline-form]").first();
	await form.locator('input[name="eventAt"]').fill(input.eventAt);
	await form.locator('select[name="timeLabel"]').selectOption(input.timeLabel);
	await form
		.locator('select[name="confidence"]')
		.selectOption(input.confidence);
	await form.locator('textarea[name="text"]').fill(input.text);
	await submitNavigating(page, () =>
		form.locator('button[type="submit"]').first().click(),
	);
	await expect(page.getByText(input.text)).toBeVisible();
}

async function attachTimelinePhoto(
	page: Page,
	eventText: string,
): Promise<void> {
	const article = page
		.locator("article")
		.filter({ hasText: eventText })
		.first();
	const form = article.locator('form[enctype="multipart/form-data"]').first();
	await form.locator('input[name="file"]').setInputFiles({
		buffer: pngFixture,
		mimeType: "image/png",
		name: "synthetic-guard.png",
	});
	await submitNavigating(page, () =>
		form.locator('button[type="submit"]').click(),
	);
	await expect(page.getByText("synthetic-guard.png")).toBeVisible();
}

async function addFiveWhysTurn(
	page: Page,
	incidentId: string,
	input:
		| { answer: string; timelineOptionIndex: number; parentStatement?: never }
		| { answer: string; parentStatement: string; timelineOptionIndex?: never },
): Promise<void> {
	await page.goto(`${appBaseUrl}/incidents/${incidentId}/causes`);
	let form = page.locator("form[data-ssfw-causes-form]").first();

	if ("parentStatement" in input) {
		const article = page
			.locator("article")
			.filter({ hasText: input.parentStatement })
			.first();
		form = article
			.locator("form[data-ssfw-causes-form]")
			.filter({ has: page.locator('input[name="parentId"]') })
			.first();
	} else {
		await form.locator('select[name="timelineEventId"]').selectOption({
			index: input.timelineOptionIndex,
		});
	}

	await form.locator('textarea[name="answer"]').fill(input.answer);
	await submitNavigating(page, () =>
		form.locator('button[type="submit"]').click(),
	);
	await expect(page.getByText(input.answer).first()).toBeVisible();
}

async function markRootCause(page: Page, statement: string): Promise<void> {
	const article = page
		.locator("article")
		.filter({ hasText: statement })
		.first();
	const form = article
		.locator("form[data-ssfw-causes-form]")
		.filter({ has: page.locator('input[name="_action"][value="update"]') })
		.first();
	await form.locator('input[name="isRootCause"]').check();
	await submitNavigating(page, () =>
		form.locator('button[type="submit"]').first().click(),
	);
	await expect(
		article.getByText("Key contributing factor", { exact: true }).first(),
	).toBeVisible();
}

async function addCorrectiveAction(
	page: Page,
	incidentId: string,
	input: {
		causeStatement: string;
		description: string;
		dueDate: string;
		ownerRole: string;
	},
): Promise<void> {
	await page.goto(`${appBaseUrl}/incidents/${incidentId}/actions`);
	const article = page
		.locator("article")
		.filter({ hasText: input.causeStatement })
		.first();
	const form = article
		.locator("form[data-ssfw-incident-action-form]")
		.filter({ has: page.locator('input[name="causeNodeId"]') })
		.first();
	await form.locator('textarea[name="description"]').fill(input.description);
	await form.locator('input[name="ownerRole"]').fill(input.ownerRole);
	await form.locator('input[name="dueDate"]').fill(input.dueDate);
	await form
		.locator('select[name="actionType"]')
		.selectOption("ORGANIZATIONAL");
	await submitNavigating(page, () =>
		form.locator('button[type="submit"]').click(),
	);
	await expect(page.getByText(input.description)).toBeVisible();
}

async function recordHiraFollowup(
	page: Page,
	incidentId: string,
): Promise<void> {
	await page.goto(`${appBaseUrl}/incidents/${incidentId}/hira-followup`);
	await waitForCsrfFormHandler(page);
	await page.locator('input[name="hiraFollowupNeeded"]').check();
	await page
		.locator('textarea[name="hiraFollowupText"]')
		.fill("Follow up the HIRA for the mixer guarding task.");
	await submitNavigating(page, () =>
		page
			.locator('form[action$="/hira-followup"] button[type="submit"]')
			.click(),
	);
	await expect(page).toHaveURL(
		new RegExp(`/incidents/${incidentId}/investigation$`),
	);
}

async function reviewInvestigationWorkbench(
	page: Page,
	incidentId: string,
): Promise<void> {
	await page.goto(`${appBaseUrl}/incidents/${incidentId}/investigation`);
	await expect(page.getByText("Investigation workbench").first()).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "What do we know?" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "What helped this happen?" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "What should we change?" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Ready to close?" }),
	).toBeVisible();
	await expect(
		page.getByText("Create escalation path for cancelled maintenance windows."),
	).toBeVisible();
	await expect(
		page.getByText("Follow up the HIRA for the mixer guarding task."),
	).toBeVisible();
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

async function waitForCsrfFormHandler(page: Page): Promise<void> {
	await page.waitForFunction(
		() =>
			(window as typeof window & { __ssfwCsrfFormHandlerReady?: boolean })
				.__ssfwCsrfFormHandlerReady === true,
	);
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
