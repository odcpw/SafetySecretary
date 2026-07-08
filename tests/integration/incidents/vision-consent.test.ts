import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import ts from "typescript";
import type { Locale } from "../../../src/lib/i18n/types";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "next/server") {
			return nextResolve("next/server.js", context);
		}

		if (!context.parentURL || !isLocalImport(specifier)) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}.tsx`, context.parentURL),
			new URL(`${specifier}.json`, context.parentURL),
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) => existsSync(candidate));

		if (resolved) {
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (!url.startsWith("file:") || !/\.[cm]?tsx?$/.test(url)) {
			return nextLoad(url, context);
		}

		const source = readFileSync(fileURLToPath(url), "utf8");
		const transpiled = ts.transpileModule(source, {
			compilerOptions: {
				jsx: ts.JsxEmit.ReactJSX,
				module: ts.ModuleKind.ESNext,
				moduleResolution: ts.ModuleResolutionKind.Bundler,
				target: ts.ScriptTarget.ES2022,
			},
			fileName: fileURLToPath(url),
		});

		return {
			format: "module",
			shortCircuit: true,
			source: transpiled.outputText,
		};
	},
});

const databaseUrl = process.env.DATABASE_URL;
let migrated = false;
const requireFromTest = createRequire(import.meta.url);
const { JSDOM } = requireFromTest("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

const { CSRF_COOKIE_NAME } = (await import(
	moduleUrl("src/lib/auth/cookies.ts")
)) as typeof import("../../../src/lib/auth/cookies");
const { t } = (await import(
	moduleUrl("src/lib/i18n/t.ts")
)) as typeof import("../../../src/lib/i18n/t");
const { IncidentVisionAction } = (await import(
	moduleUrl("src/components/incident/IncidentVisionAction.tsx")
)) as typeof import("../../../src/components/incident/IncidentVisionAction");

test("schema and SQL define ask-first II vision consent", () => {
	const schema = readFileSync("prisma/schema.prisma", "utf8");
	const incidentSql = readFileSync("db/sql/00200_incident_case.sql", "utf8");
	const visionSql = readFileSync(
		"db/sql/00210_incident_case_vision_consent.sql",
		"utf8",
	);

	assert.match(schema, /enum IncidentVisionConsent/);
	assert.match(
		schema,
		/visionConsent\s+IncidentVisionConsent\s+@default\(ASK\)\s+@map\("vision_consent"\)/,
	);
	assert.match(incidentSql, /incident_vision_consent AS ENUM/);
	assert.match(
		incidentSql,
		/vision_consent %I\.incident_vision_consent NOT NULL DEFAULT 'ASK'/,
	);
	assert.match(visionSql, /ADD COLUMN IF NOT EXISTS vision_consent/);
	assert.match(visionSql, /ALTER COLUMN vision_consent SET DEFAULT %L/);
});

test("VisionConsentModal gates rendering and all locales have labels", () => {
	const modalSource = readFileSync(
		"src/components/incident/VisionConsentModal.tsx",
		"utf8",
	);
	const actionSource = readFileSync(
		"src/components/incident/IncidentVisionAction.tsx",
		"utf8",
	);
	// The chat-first refactor moved the vision surface into the coach photo
	// strip, which renders the modal directly with requiresVision.
	const photoStripSource = readFileSync(
		"src/components/incident/coach/PhotoStrip.tsx",
		"utf8",
	);

	assert.match(modalSource, /role="dialog"/);
	assert.match(
		modalSource,
		/!open \|\| !requiresVision \|\| !companyVisionEnabled/,
	);
	assert.match(modalSource, /initialConsent !== "ASK"/);
	assert.match(modalSource, /choose\("ASK"\)/);
	assert.match(modalSource, /choose\("ALWAYS"\)/);
	assert.match(modalSource, /choose\("NEVER"\)/);
	assert.match(actionSource, /<VisionConsentModal/);
	assert.match(actionSource, /currentConsent === "ASK"/);
	assert.match(photoStripSource, /<VisionConsentModal/);
	assert.match(photoStripSource, /requiresVision/);

	for (const locale of ["de", "en", "fr", "it"] as const) {
		assertLocaleVisionConsentLabels(locale);
	}
});

test("IncidentVisionAction opens modal and handles ASK, ALWAYS, NEVER, and company-off branches", async () => {
	const ask = await renderVisionAction({ companyVisionEnabled: true });
	try {
		await click(
			buttonByText(ask.container, t("incident.visionConsent.action", "en")),
		);
		assert.ok(dialog(ask.container), "ASK branch should open the modal");
		await click(
			buttonByText(ask.container, t("incident.visionConsent.send", "en")),
		);
		assert.deepEqual(ask.fetchBodies, [
			{ path: "vision-consent", visionConsent: "ASK" },
			{ path: "vision-request", requiresVision: true },
		]);
		assert.equal(
			statusText(ask.container),
			t("incident.visionConsent.requested", "en"),
		);
		assert.equal(dialog(ask.container), null);
		await click(
			buttonByText(ask.container, t("incident.visionConsent.action", "en")),
		);
		assert.ok(
			dialog(ask.container),
			"Send keeps ASK, so the next attempt asks again",
		);
	} finally {
		await ask.unmount();
	}

	const always = await renderVisionAction({ companyVisionEnabled: true });
	try {
		await click(
			buttonByText(always.container, t("incident.visionConsent.action", "en")),
		);
		await click(
			buttonByText(always.container, t("incident.visionConsent.always", "en")),
		);
		assert.deepEqual(always.fetchBodies, [
			{ path: "vision-consent", visionConsent: "ALWAYS" },
			{ path: "vision-request", requiresVision: true },
		]);
		await click(
			buttonByText(always.container, t("incident.visionConsent.action", "en")),
		);
		assert.deepEqual(always.fetchBodies, [
			{ path: "vision-consent", visionConsent: "ALWAYS" },
			{ path: "vision-request", requiresVision: true },
			{ path: "vision-request", requiresVision: true },
		]);
		assert.equal(dialog(always.container), null);
		assert.equal(
			statusText(always.container),
			t("incident.visionConsent.requested", "en"),
		);
	} finally {
		await always.unmount();
	}

	const never = await renderVisionAction({ companyVisionEnabled: true });
	try {
		await click(
			buttonByText(never.container, t("incident.visionConsent.action", "en")),
		);
		await click(
			buttonByText(never.container, t("incident.visionConsent.never", "en")),
		);
		assert.deepEqual(never.fetchBodies, [
			{ path: "vision-consent", visionConsent: "NEVER" },
		]);
		assert.equal(
			statusText(never.container),
			t("incident.visionConsent.workflowUnavailable", "en"),
		);
		await click(
			buttonByText(never.container, t("incident.visionConsent.action", "en")),
		);
		assert.equal(dialog(never.container), null);
		assert.equal(
			statusText(never.container),
			t("incident.visionConsent.workflowUnavailable", "en"),
		);
	} finally {
		await never.unmount();
	}

	const companyOff = await renderVisionAction({ companyVisionEnabled: false });
	try {
		await click(
			buttonByText(
				companyOff.container,
				t("incident.visionConsent.action", "en"),
			),
		);
		assert.deepEqual(companyOff.fetchBodies, []);
		assert.equal(dialog(companyOff.container), null);
		assert.equal(
			statusText(companyOff.container),
			t("incident.visionConsent.companyUnavailable", "en"),
		);
	} finally {
		await companyOff.unmount();
	}
});

if (!databaseUrl) {
	test("II vision consent route integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const visionConsentRoute = (await import(
		moduleUrl("src/app/api/incidents/[id]/vision-consent/route.ts")
	)) as typeof import("../../../src/app/api/incidents/[id]/vision-consent/route");
	const { issueSession } = (await import(
		moduleUrl("src/lib/auth/session.ts")
	)) as typeof import("../../../src/lib/auth/session");
	const { mintCsrfToken } = (await import(
		moduleUrl("src/lib/auth/csrf.ts")
	)) as typeof import("../../../src/lib/auth/csrf");
	const { prisma, dropTenantSchema, withTenantConnection } = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");
	const { serialiseWorkflow } = (await import(
		moduleUrl("src/lib/incident/serialise.ts")
	)) as typeof import("../../../src/lib/incident/serialise");

	test("II vision consent persists ASK, ALWAYS, and NEVER branches with tenant scoping", async () => {
		ensureMigrated();
		const tenantA = await seedTenant("a", true);
		const tenantB = await seedTenant("b", true);
		const caseId = randomUUID();

		try {
			await insertIncidentCase({
				caseId,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});
			assert.equal(await currentVisionConsent(tenantA.tenantId, caseId), "ASK");

			const ask = await postConsent(tenantA, caseId, "ASK");
			assert.equal(ask.status, 200);
			assert.deepEqual(await ask.json(), {
				id: caseId,
				visionConsent: "ASK",
			});
			assert.equal(await currentVisionConsent(tenantA.tenantId, caseId), "ASK");

			const always = await postConsent(tenantA, caseId, "ALWAYS");
			assert.equal(always.status, 200);
			assert.deepEqual(await always.json(), {
				id: caseId,
				visionConsent: "ALWAYS",
			});
			assert.equal(
				await currentVisionConsent(tenantA.tenantId, caseId),
				"ALWAYS",
			);

			const never = await postConsent(tenantA, caseId, "NEVER");
			assert.equal(never.status, 200);
			assert.deepEqual(await never.json(), {
				code: "vision_unavailable_workflow",
				id: caseId,
				visionConsent: "NEVER",
			});
			assert.equal(
				await currentVisionConsent(tenantA.tenantId, caseId),
				"NEVER",
			);

			const crossTenant = await postConsent(tenantB, caseId, "ALWAYS");
			assert.equal(crossTenant.status, 404);
			assert.deepEqual(await crossTenant.json(), {
				code: "INCIDENT_NOT_FOUND",
			});
			assert.equal(
				await currentVisionConsent(tenantA.tenantId, caseId),
				"NEVER",
			);

			const snapshot = await serialiseWorkflow("II", caseId, {
				tenantId: tenantA.tenantId,
			});
			assert.equal(record(snapshot.case).visionConsent, "NEVER");
			console.log(
				`DB inspection II vision consent: default=ASK; final=${await currentVisionConsent(
					tenantA.tenantId,
					caseId,
				)}; snapshot=${String(record(snapshot.case).visionConsent)}`,
			);
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	test("company vision off short-circuits before writing workflow consent", async () => {
		ensureMigrated();
		const tenant = await seedTenant("off", false);
		const caseId = randomUUID();

		try {
			await insertIncidentCase({
				caseId,
				tenantId: tenant.tenantId,
				userId: tenant.userId,
			});

			const response = await postConsent(tenant, caseId, "ALWAYS");

			assert.equal(response.status, 409);
			assert.deepEqual(await response.json(), {
				code: "vision_unavailable_company",
			});
			assert.equal(await currentVisionConsent(tenant.tenantId, caseId), "ASK");
			console.log(
				`DB inspection II vision company-off: vision_enabled=false; consent=${await currentVisionConsent(
					tenant.tenantId,
					caseId,
				)}`,
			);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});

	async function seedTenant(
		label: string,
		visionEnabled: boolean,
	): Promise<SeededTenant> {
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-pa6-${label}-${randomUUID()}`,
				visionEnabled,
			},
		});
		const user = await prisma.user.create({
			data: {
				email: `ssfw-pa6-${label}-${randomUUID()}@example.invalid`,
				uiLocale: "en",
			},
		});
		await prisma.tenantMembership.create({
			data: {
				tenantId: tenant.id,
				userId: user.id,
			},
		});
		await provisionIncidentSchema(tenant.id);
		const session = await issueSession(user.id, tenant.id);
		return {
			sessionCookie: session.cookieValue,
			tenantId: tenant.id,
			userId: user.id,
			visionEnabled,
		};
	}

	async function insertIncidentCase(input: {
		caseId: string;
		tenantId: string;
		userId: string;
	}): Promise<void> {
		const schema = quoteIdent(names(input.tenantId).schema);

		await prisma.$executeRawUnsafe(
			`INSERT INTO ${schema}.incident_case (
				id,
				title,
				incident_at,
				incident_type,
				coordinator_role,
				content_language,
				created_by
			) VALUES (
				${sqlString(input.caseId)}::uuid,
				'II vision consent test',
				'2026-05-05T05:55:00Z'::timestamptz,
				'NEAR_MISS',
				'Safety lead',
				'en',
				${sqlString(input.userId)}::uuid
			)`,
		);
	}

	async function currentVisionConsent(
		tenantId: string,
		caseId: string,
	): Promise<string> {
		return withTenantConnection(tenantId, async (tx) => {
			const rows = await tx.$queryRaw<Array<{ visionConsent: string }>>`
				SELECT vision_consent::text AS "visionConsent"
				FROM incident_case
				WHERE id = ${caseId}::uuid
			`;
			const row = rows[0];
			assert.ok(row);
			return row.visionConsent;
		});
	}

	async function postConsent(
		tenant: SeededTenant,
		caseId: string,
		visionConsent: "ASK" | "ALWAYS" | "NEVER",
	): Promise<Response> {
		const csrf = mintCsrfToken(tenant.sessionCookie);
		return visionConsentRoute.POST(
			new NextRequest(
				`https://app.example.test/api/incidents/${caseId}/vision-consent`,
				{
					body: JSON.stringify({ visionConsent }),
					headers: {
						cookie: `ssfw_session=${tenant.sessionCookie}; ${CSRF_COOKIE_NAME}=${csrf}`,
						"content-type": "application/json",
						"x-ssfw-csrf": csrf,
						"x-ssfw-tenant-id": tenant.tenantId,
						"x-ssfw-user-id": tenant.userId,
					},
					method: "POST",
				},
			),
			{ params: { id: caseId } },
		);
	}

	async function cleanupTenant(input: SeededTenant): Promise<void> {
		await dropTenantSchema(input.tenantId).catch(() => undefined);
		await prisma.tenantMembership.deleteMany({
			where: { tenantId: input.tenantId },
		});
		await prisma.session.deleteMany({ where: { tenantId: input.tenantId } });
		await prisma.tenant.deleteMany({ where: { id: input.tenantId } });
		await prisma.user.deleteMany({ where: { id: input.userId } });
	}

	async function provisionIncidentSchema(tenantId: string): Promise<void> {
		const { role, schema } = names(tenantId);
		await prisma.$executeRawUnsafe(
			`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${sqlString(
				role,
			)}) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', ${sqlString(
				role,
			)}); END IF; END $$`,
		);
		await prisma.$executeRawUnsafe(`GRANT ${quoteIdent(role)} TO CURRENT_USER`);
		await prisma.$executeRawUnsafe(
			`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)} AUTHORIZATION ${quoteIdent(
				role,
			)}`,
		);
		await prisma.$executeRawUnsafe(
			`ALTER SCHEMA ${quoteIdent(schema)} OWNER TO ${quoteIdent(role)}`,
		);
		await prisma.$executeRawUnsafe(
			`GRANT USAGE ON SCHEMA ${quoteIdent(schema)} TO ${quoteIdent(role)}`,
		);
		await prisma.$executeRawUnsafe(
			`GRANT USAGE ON SCHEMA "shared" TO ${quoteIdent(role)}`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.apply_incident_case_schema(${sqlString(schema)}::name)`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.apply_incident_soft_delete_schema(${sqlString(schema)}::name)`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.apply_incident_cause_branch_status_schema(${sqlString(
				schema,
			)}::name)`,
		);
	}
}

function ensureMigrated(): void {
	if (migrated) {
		return;
	}

	const result = spawnSync("pnpm", ["db:migrate"], {
		cwd: process.cwd(),
		encoding: "utf8",
		env: { ...process.env, DATABASE_URL: databaseUrl },
	});

	assert.equal(
		result.status,
		0,
		`pnpm db:migrate failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);
	migrated = true;
}

type SeededTenant = {
	tenantId: string;
	userId: string;
	visionEnabled: boolean;
	sessionCookie: string;
};

type RenderedVisionAction = {
	container: HTMLElement;
	fetchBodies: Array<Record<string, unknown> & { path: string }>;
	unmount: () => Promise<void>;
};

type TestDom = {
	document: Document;
	window: Window &
		typeof globalThis & {
			Event: typeof Event;
			HTMLElement: typeof HTMLElement;
			HTMLButtonElement: typeof HTMLButtonElement;
		};
};

function record(value: unknown): Record<string, unknown> {
	assert.ok(value && typeof value === "object" && !Array.isArray(value));
	return value as Record<string, unknown>;
}

function names(tenantId: string): {
	role: string;
	schema: string;
} {
	const suffix = tenantId.toLowerCase().replaceAll("-", "_");
	return {
		role: `role_tenant_${suffix}`,
		schema: `tenant_${suffix}`,
	};
}

function quoteIdent(value: string): string {
	return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

async function renderVisionAction({
	companyVisionEnabled,
	initialConsent = "ASK",
}: {
	companyVisionEnabled: boolean;
	initialConsent?: "ASK" | "ALWAYS" | "NEVER";
}): Promise<RenderedVisionAction> {
	const dom = setupDom();
	const { document } = dom;
	const container = document.createElement("div");
	document.body.append(container);
	const fetchBodies: Array<Record<string, unknown> & { path: string }> = [];
	const originalFetch = globalThis.fetch;
	const { createRoot } = (await import(
		"react-dom/client"
	)) as typeof import("react-dom/client");
	const root: Root = createRoot(container);

	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const body =
			typeof init?.body === "string"
				? (JSON.parse(init.body) as Record<string, unknown>)
				: {};
		const path = String(input).includes("/vision-request")
			? "vision-request"
			: "vision-consent";
		fetchBodies.push({ path, ...body });
		const visionConsent = body.visionConsent;
		return new Response(
			JSON.stringify(
				visionConsent === "NEVER"
					? { code: "vision_unavailable_workflow", visionConsent }
					: { visionConsent },
			),
			{
				headers: { "content-type": "application/json" },
				status: 200,
			},
		);
	}) as typeof fetch;

	await act(async () => {
		root.render(
			createElement(IncidentVisionAction, {
				companyVisionEnabled,
				incidentId: randomUUID(),
				initialConsent,
				labels: visionLabels("en"),
				requiresVision: true,
			}),
		);
	});

	return {
		container,
		fetchBodies,
		unmount: async () => {
			await act(async () => {
				root.unmount();
			});
			globalThis.fetch = originalFetch;
			container.remove();
		},
	};
}

function setupDom(): TestDom {
	const dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "https://app.example.test/incidents/00000000-0000-4000-8000-000000000001",
	});
	const { document } = dom.window;
	// The vision components read a session-bound CSRF cookie via ensureCsrfToken
	// before fetching; provide one so the consent/request calls reach fetch.
	document.cookie = `${CSRF_COOKIE_NAME}=incident-vision-csrf`;
	const globals = globalThis as unknown as Record<string, unknown>;
	globals.IS_REACT_ACT_ENVIRONMENT = true;
	globals.window = dom.window;
	globals.document = document;
	globals.HTMLElement = dom.window.HTMLElement;
	globals.Event = dom.window.Event;
	globals.MouseEvent = dom.window.MouseEvent;
	globals.HTMLButtonElement = dom.window.HTMLButtonElement;
	globals.Node = dom.window.Node;
	Object.defineProperty(globalThis, "crypto", {
		configurable: true,
		value: dom.window.crypto,
	});
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: dom.window.navigator,
	});
	return { document, window: dom.window as TestDom["window"] };
}

async function click(button: HTMLButtonElement): Promise<void> {
	await act(async () => {
		button.click();
	});
}

function buttonByText(
	container: HTMLElement,
	label: string,
): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find(
		(candidate) => candidate.textContent === label,
	);
	assert.ok(button, `${label} button should render`);
	return button;
}

function dialog(container: HTMLElement): Element | null {
	return container.querySelector('[role="dialog"]');
}

function statusText(container: HTMLElement): string | null {
	return container.querySelector('[role="status"]')?.textContent ?? null;
}

function visionLabels(locale: Locale) {
	return {
		actionButton: t("incident.visionConsent.action", locale),
		alwaysButton: t("incident.visionConsent.always", locale),
		askButton: t("incident.visionConsent.send", locale),
		cancelButton: t("incident.visionConsent.cancel", locale),
		companyUnavailable: t("incident.visionConsent.companyUnavailable", locale),
		description: t("incident.visionConsent.description", locale),
		error: t("incident.visionConsent.error", locale),
		neverButton: t("incident.visionConsent.never", locale),
		pending: t("incident.visionConsent.pending", locale),
		requestedStatus: t("incident.visionConsent.requested", locale),
		title: t("incident.visionConsent.title", locale),
		workflowUnavailable: t(
			"incident.visionConsent.workflowUnavailable",
			locale,
		),
	};
}

function assertLocaleVisionConsentLabels(locale: Locale): void {
	for (const key of [
		"incident.visionConsent.action",
		"incident.visionConsent.always",
		"incident.visionConsent.cancel",
		"incident.visionConsent.companyUnavailable",
		"incident.visionConsent.description",
		"incident.visionConsent.error",
		"incident.visionConsent.never",
		"incident.visionConsent.pending",
		"incident.visionConsent.requested",
		"incident.visionConsent.send",
		"incident.visionConsent.title",
		"incident.visionConsent.workflowUnavailable",
	] as const) {
		assert.notEqual(t(key, locale).trim(), "");
	}
}
