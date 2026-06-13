import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";
import type { ValidatedSession } from "../../../src/lib/auth/session";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			specifier === "next/server" &&
			context.parentURL?.includes("/src/app/api/settings/vision/")
		) {
			return nextResolve("next/server.js", context);
		}

		if (context.parentURL && specifier.startsWith(".")) {
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
		}

		return nextResolve(specifier, context);
	},
});

const routeModulePath = pathToFileURL(
	path.resolve("src/app/api/settings/vision/route.ts"),
).href;
const consentModulePath = pathToFileURL(
	path.resolve("src/lib/llm/consent.ts"),
).href;

const { handleVisionSettingsGet, handleVisionSettingsPost } = (await import(
	routeModulePath
)) as typeof import("../../../src/app/api/settings/vision/route");
const {
	WORKFLOW_VISION_CONSENTS,
	applyVisionConsentDefault,
	isWorkflowVisionConsent,
} = (await import(
	consentModulePath
)) as typeof import("../../../src/lib/llm/consent");

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const userA = "33333333-3333-4333-8333-333333333333";
const sessionCookie = "44444444-4444-4444-8444-444444444444";
const csrfValue = "csrf-vision-token";

test("workflow vision consent contract defaults unseen workflows to ASK", () => {
	assert.deepEqual([...WORKFLOW_VISION_CONSENTS], ["ASK", "ALWAYS", "NEVER"]);
	assert.equal(applyVisionConsentDefault(), "ASK");
	assert.equal(applyVisionConsentDefault(null), "ASK");
	assert.equal(applyVisionConsentDefault("ALWAYS"), "ALWAYS");
	assert.equal(applyVisionConsentDefault("NEVER"), "NEVER");
	assert.equal(isWorkflowVisionConsent("ASK"), true);
	assert.equal(isWorkflowVisionConsent("INVALID"), false);
});

test("shared tenant schema and SQL migration keep company vision off by default", () => {
	const schema = readFileSync("prisma/schema.prisma", "utf8");
	const sql = readFileSync("db/sql/00070_company_vision_enabled.sql", "utf8");

	assert.match(
		schema,
		/visionEnabled\s+Boolean\s+@default\(false\)\s+@map\("vision_enabled"\)/,
	);
	assert.match(
		sql,
		/ADD COLUMN IF NOT EXISTS "vision_enabled" boolean NOT NULL DEFAULT false/,
	);
	assert.match(sql, /ALTER COLUMN "vision_enabled" SET DEFAULT false/);
	assert.match(sql, /ALTER COLUMN "vision_enabled" SET NOT NULL/);
	assert.doesNotMatch(sql, /IS DISTINCT FROM false/);
});

test("tenant member can read and update the company vision switch", async () => {
	const store = new MemoryVisionSettingsStore();
	store.memberships.add(`${tenantA}:${userA}`);

	const readResponse = await handleVisionSettingsGet(
		request("GET", "/api/settings/vision"),
		store,
		validatorWithSession(validSession()),
	);
	assert.equal(readResponse.status, 200);
	assert.deepEqual(await readResponse.json(), { visionEnabled: false });

	const updateResponse = await handleVisionSettingsPost(
		request("POST", "/api/settings/vision", { visionEnabled: true }),
		store,
		validatorWithSession(validSession()),
	);
	assert.equal(updateResponse.status, 200);
	assert.deepEqual(await updateResponse.json(), { visionEnabled: true });
	assert.equal(store.values.get(tenantA), true);
});

test("fresh tenants read as default-off until explicitly enabled", async () => {
	const store = new MemoryVisionSettingsStore();
	store.memberships.add(`${tenantA}:${userA}`);

	const response = await handleVisionSettingsGet(
		request("GET", "/api/settings/vision"),
		store,
		validatorWithSession(validSession()),
	);

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { visionEnabled: false });
	assert.equal(store.values.has(tenantA), false);
});

test("tenant A session cannot set tenant B vision state", async () => {
	const store = new MemoryVisionSettingsStore();
	store.memberships.add(`${tenantA}:${userA}`);
	store.values.set(tenantB, false);

	const response = await handleVisionSettingsPost(
		request("POST", "/api/settings/vision", {
			tenantId: tenantB,
			visionEnabled: true,
		}),
		store,
		validatorWithSession(validSession()),
	);

	assert.equal(response.status, 404);
	assert.deepEqual(await response.json(), { code: "VISION_SETTING_NOT_FOUND" });
	assert.equal(store.values.get(tenantB), false);
});

test("tenant read requires membership in the session tenant", async () => {
	const store = new MemoryVisionSettingsStore();
	store.values.set(tenantB, true);

	const response = await handleVisionSettingsGet(
		request("GET", "/api/settings/vision"),
		store,
		validatorWithSession({ ...validSession(), tenantId: tenantB }),
	);

	assert.equal(response.status, 403);
	assert.deepEqual(await response.json(), {
		code: "TENANT_MEMBERSHIP_REQUIRED",
	});
});

test("anonymous and missing-CSRF requests are rejected before store writes", async () => {
	const store = new MemoryVisionSettingsStore();
	store.memberships.add(`${tenantA}:${userA}`);

	const anonymous = await handleVisionSettingsPost(
		request("POST", "/api/settings/vision", { visionEnabled: true }),
		store,
		validatorWithSession(null),
	);
	assert.equal(anonymous.status, 401);

	const missingCsrf = await handleVisionSettingsPost(
		request("POST", "/api/settings/vision", { visionEnabled: true }, false),
		store,
		validatorWithSession(validSession()),
	);
	assert.equal(missingCsrf.status, 403);
	assert.equal(store.values.has(tenantA), false);
});

class MemoryVisionSettingsStore {
	readonly memberships = new Set<string>();
	readonly values = new Map<string, boolean>();

	async read(input: {
		tenantId: string;
		userId: string;
	}): Promise<boolean | null> {
		if (!this.memberships.has(`${input.tenantId}:${input.userId}`)) {
			return null;
		}

		return this.values.get(input.tenantId) ?? false;
	}

	async update(input: {
		tenantId: string;
		userId: string;
		visionEnabled: boolean;
	}): Promise<boolean> {
		if (!this.memberships.has(`${input.tenantId}:${input.userId}`)) {
			return false;
		}

		this.values.set(input.tenantId, input.visionEnabled);
		return true;
	}
}

function request(
	method: "GET" | "POST",
	pathname: string,
	body?: Record<string, unknown>,
	includeCsrf = true,
): NextRequest {
	const headers = new Headers({
		cookie: includeCsrf
			? `ssfw_session=${sessionCookie}; ssfw_csrf=${csrfValue}`
			: `ssfw_session=${sessionCookie}`,
	});

	if (body) {
		headers.set("content-type", "application/json");
	}

	if (includeCsrf) {
		headers.set("x-ssfw-csrf", csrfValue);
	}

	return new NextRequest(`https://app.example.test${pathname}`, {
		body: body ? JSON.stringify(body) : undefined,
		headers,
		method,
	});
}

function validatorWithSession(session: ValidatedSession | null) {
	return async () => session;
}

function validSession(): ValidatedSession {
	return {
		deviceHint: "desktop",
		expiresAt: new Date("2026-06-05T00:00:00.000Z"),
		id: sessionCookie,
		lastSeenAt: new Date("2026-05-05T00:00:00.000Z"),
		tenantId: tenantA,
		userId: userA,
	};
}
