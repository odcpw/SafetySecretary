import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

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
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	test("II coach feedback integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const { NextRequest } = (await import(
		"next/server.js"
	)) as typeof import("next/server");
	const route = (await import(
		moduleUrl("src/app/api/incidents/[id]/coach/feedback/route.ts")
	)) as typeof import("../../../src/app/api/incidents/[id]/coach/feedback/route");
	const { issueSession } = (await import(
		moduleUrl("src/lib/auth/session.ts")
	)) as typeof import("../../../src/lib/auth/session");
	const {
		dropTenantSchema,
		prisma,
		provisionTenantSchema,
		withTenantConnection,
	} = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");

	test("coach feedback is cookie-authenticated, CSRF-protected, upserted, and tenant-scoped", async () => {
		ensureMigrated();
		const tenantA = await seedTenant("a");
		const tenantB = await seedTenant("b");
		const sessionA = await issueSession(tenantA.userId, tenantA.tenantId);
		const sessionB = await issueSession(tenantB.userId, tenantB.tenantId);
		const csrf = randomUUID();
		const caseId = randomUUID();

		try {
			await insertIncidentCase({
				caseId,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});

			const unauthenticated = await route.GET(
				new NextRequest(
					`https://app.example.test/api/incidents/${caseId}/coach/feedback`,
				),
				{ params: { id: caseId } },
			);
			assert.equal(unauthenticated.status, 401);
			assert.equal(record(await unauthenticated.json()).code, "AUTH_REQUIRED");

			const forgedHeaderRead = await route.GET(
				request({
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/coach/feedback`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(forgedHeaderRead.status, 401);
			assert.equal(record(await forgedHeaderRead.json()).code, "AUTH_REQUIRED");

			const initial = await route.GET(
				request({
					sessionCookie: sessionA.cookieValue,
					url: `https://app.example.test/api/incidents/${caseId}/coach/feedback`,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(initial.status, 200);
			assert.equal(record(await initial.json()).feedback, null);

			const crossTenant = await route.GET(
				request({
					sessionCookie: sessionB.cookieValue,
					url: `https://app.example.test/api/incidents/${caseId}/coach/feedback`,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(crossTenant.status, 404);

			const missingCsrf = await route.POST(
				request({
					body: {
						comment: "Works well.",
						rating: 4,
					},
					method: "POST",
					sessionCookie: sessionA.cookieValue,
					url: `https://app.example.test/api/incidents/${caseId}/coach/feedback`,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(missingCsrf.status, 403);
			assert.equal(record(await missingCsrf.json()).code, "CSRF_REQUIRED");

			const invalidRating = await route.POST(
				request({
					body: {
						comment: "Too high.",
						rating: 5,
					},
					csrf,
					method: "POST",
					sessionCookie: sessionA.cookieValue,
					url: `https://app.example.test/api/incidents/${caseId}/coach/feedback`,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(invalidRating.status, 400);
			assert.equal(
				record(await invalidRating.json()).code,
				"INVALID_FEEDBACK_PAYLOAD",
			);

			const saved = await route.POST(
				request({
					body: {
						comment: "The next-question flow was clear. OP initials only.",
						rating: 4,
					},
					csrf,
					method: "POST",
					sessionCookie: sessionA.cookieValue,
					url: `https://app.example.test/api/incidents/${caseId}/coach/feedback`,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(saved.status, 200);
			assert.deepEqual(pickFeedback(await saved.json()), {
				comment: "The next-question flow was clear. OP initials only.",
				incidentId: caseId,
				rating: 4,
			});

			const updated = await route.POST(
				request({
					body: {
						comment: "   ",
						rating: 2,
					},
					csrf,
					method: "POST",
					sessionCookie: sessionA.cookieValue,
					url: `https://app.example.test/api/incidents/${caseId}/coach/feedback`,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(updated.status, 200);
			assert.deepEqual(pickFeedback(await updated.json()), {
				comment: null,
				incidentId: caseId,
				rating: 2,
			});

			const stored = await inspectFeedback(tenantA.tenantId, caseId);
			assert.deepEqual(stored, {
				comment: null,
				rating: 2,
				userId: tenantA.userId,
			});
			console.log(
				`DB inspection coach feedback: incident_coach_feedback.case_id=${caseId}; user_id=${stored.userId}; rating=${stored.rating}; comment=null`,
			);
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});

	async function seedTenant(label: string): Promise<{
		tenantId: string;
		userId: string;
	}> {
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-feedback-${label}-${randomUUID()}`,
			},
		});
		const user = await prisma.user.create({
			data: {
				email: `ssfw-feedback-${label}-${randomUUID()}@example.invalid`,
				uiLocale: "en",
			},
		});
		await prisma.tenantMembership.create({
			data: {
				tenantId: tenant.id,
				userId: user.id,
			},
		});
		await provisionTenantSchema(tenant.id);
		return { tenantId: tenant.id, userId: user.id };
	}

	async function insertIncidentCase(input: {
		caseId: string;
		tenantId: string;
		userId: string;
	}): Promise<void> {
		await withTenantConnection(input.tenantId, async (tx) => {
			await tx.$executeRaw`
				INSERT INTO incident_case (
					id,
					title,
					incident_type,
					coordinator_role,
					content_language,
					created_by
				) VALUES (
					${input.caseId}::uuid,
					'II coach feedback test',
					'NEAR_MISS',
					'Safety lead',
					'en',
					${input.userId}::uuid
				)
			`;
		});
	}

	async function inspectFeedback(
		tenantId: string,
		caseId: string,
	): Promise<{
		comment: string | null;
		rating: number;
		userId: string;
	}> {
		const rows = await withTenantConnection(
			tenantId,
			async (tx) =>
				tx.$queryRaw<
					Array<{
						comment: string | null;
						rating: number;
						userId: string;
					}>
				>`
				SELECT
					comment_text AS comment,
					rating::int,
					user_id::text AS "userId"
				FROM incident_coach_feedback
				WHERE case_id = ${caseId}::uuid
			`,
		);

		assert.equal(rows.length, 1);
		return rows[0] as {
			comment: string | null;
			rating: number;
			userId: string;
		};
	}

	async function cleanupTenant(input: {
		tenantId: string;
		userId: string;
	}): Promise<void> {
		await dropTenantSchema(input.tenantId).catch(() => undefined);
		await prisma.tenantMembership.deleteMany({
			where: { tenantId: input.tenantId },
		});
		await prisma.session.deleteMany({ where: { tenantId: input.tenantId } });
		await prisma.tenant.deleteMany({ where: { id: input.tenantId } });
		await prisma.user.deleteMany({ where: { id: input.userId } });
	}

	function request(input: {
		body?: Record<string, unknown>;
		csrf?: string;
		method?: string;
		sessionCookie?: string;
		tenantId?: string;
		url: string;
		userId?: string;
	}) {
		const headers: Record<string, string> = {
			"content-type": "application/json",
		};

		if (input.tenantId && input.userId) {
			headers["x-ssfw-tenant-id"] = input.tenantId;
			headers["x-ssfw-user-id"] = input.userId;
		}

		const cookies = [];
		if (input.sessionCookie) {
			cookies.push(`ssfw_session=${input.sessionCookie}`);
		}
		if (input.csrf) {
			cookies.push(`ssfw_csrf=${input.csrf}`);
			headers["x-ssfw-csrf"] = input.csrf;
		}
		if (cookies.length > 0) {
			headers.cookie = cookies.join("; ");
		}

		return new NextRequest(input.url, {
			body: input.body ? JSON.stringify(input.body) : undefined,
			headers,
			method: input.method ?? "GET",
		});
	}
}

function pickFeedback(payload: unknown): {
	comment: string | null;
	incidentId: string;
	rating: number;
} {
	const feedback = record(record(payload).feedback);
	return {
		comment: typeof feedback.comment === "string" ? feedback.comment : null,
		incidentId: String(feedback.incidentId),
		rating: Number(feedback.rating),
	};
}

function record(value: unknown): Record<string, unknown> {
	assert.ok(value && typeof value === "object" && !Array.isArray(value));
	return value as Record<string, unknown>;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}

let migrated = false;

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
