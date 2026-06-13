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
	test("chemical profile CRUD routes", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const { NextRequest } = (await import(
		"next/server.js"
	)) as typeof import("next/server");
	const collectionRoute = (await import(
		moduleUrl("src/app/api/chemicals/route.ts")
	)) as typeof import("../../../src/app/api/chemicals/route");
	const detailRoute = (await import(
		moduleUrl("src/app/api/chemicals/[id]/route.ts")
	)) as typeof import("../../../src/app/api/chemicals/[id]/route");
	const { issueSession } = (await import(
		moduleUrl("src/lib/auth/session.ts")
	)) as typeof import("../../../src/lib/auth/session");
	const {
		dropTenantSchema,
		prisma,
		tenantDatabaseNames,
		withTenantConnection,
	} = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");

	test("chemical profile routes create, read, update, archive, and reject invalid storage paths", async () => {
		ensureMigrated();
		const tenantA = await seedTenant("a");
		const tenantB = await seedTenant("b");
		const otherTenantId = randomUUID();
		const csrf = randomUUID();
		const session = await issueSession(tenantA.userId, tenantA.tenantId);
		const tenantBSession = await issueSession(tenantB.userId, tenantB.tenantId);

		try {
			const unauthenticated = await collectionRoute.GET(
				new NextRequest("https://app.example.test/api/chemicals"),
			);
			assert.equal(unauthenticated.status, 401);
			assert.equal(record(await unauthenticated.json()).code, "AUTH_REQUIRED");

			const forgedHeaderRead = await collectionRoute.GET(
				request({
					tenantId: tenantA.tenantId,
					url: "https://app.example.test/api/chemicals",
					userId: tenantA.userId,
				}),
			);
			assert.equal(forgedHeaderRead.status, 401);
			assert.equal(record(await forgedHeaderRead.json()).code, "AUTH_REQUIRED");

			const forgedHeaderCreate = await collectionRoute.POST(
				request({
					body: {
						manufacturer: "Example Supplier",
						productName: "Fixture solvent",
					},
					csrf,
					method: "POST",
					tenantId: tenantA.tenantId,
					url: "https://app.example.test/api/chemicals",
					userId: tenantA.userId,
				}),
			);
			assert.equal(forgedHeaderCreate.status, 401);
			assert.equal(
				record(await forgedHeaderCreate.json()).code,
				"AUTH_REQUIRED",
			);

			const missingCsrf = await collectionRoute.POST(
				request({
					body: {
						manufacturer: "Example Supplier",
						productName: "Fixture solvent",
					},
					method: "POST",
					sessionCookie: session.cookieValue,
					url: "https://app.example.test/api/chemicals",
				}),
			);
			assert.equal(missingCsrf.status, 403);
			assert.equal(record(await missingCsrf.json()).code, "CSRF_REQUIRED");

			const invalidCreate = await collectionRoute.POST(
				request({
					body: {
						manufacturer: "Example Supplier",
						productName: "Fixture solvent",
						storagePath: `tenants/${otherTenantId}/attachments/sds.pdf`,
					},
					csrf,
					method: "POST",
					sessionCookie: session.cookieValue,
					url: "https://app.example.test/api/chemicals",
				}),
			);
			assert.equal(invalidCreate.status, 400);
			assert.equal(
				record(await invalidCreate.json()).code,
				"INVALID_CHEMICAL_PROFILE_PAYLOAD",
			);

			const created = await collectionRoute.POST(
				request({
					body: {
						casNumber: "64-17-5",
						manufacturer: "Example Supplier",
						productName: "Fixture solvent",
						storagePath: `tenants/${tenantA.tenantId}/attachments/fixture-solvent-sds.pdf`,
						unNumber: "1170",
					},
					csrf,
					method: "POST",
					sessionCookie: session.cookieValue,
					url: "https://app.example.test/api/chemicals",
				}),
			);
			assert.equal(created.status, 201);
			const profile = profilePayload(await created.json());
			assert.equal(profile.productName, "Fixture solvent");
			assert.equal(profile.profileStatus, "draft");
			assert.equal(profile.extractionStatus, "none");
			assert.deepEqual(profile.sdsAttachments, [
				{
					fileName: "fixture-solvent-sds.pdf",
					storagePath: `tenants/${tenantA.tenantId}/attachments/fixture-solvent-sds.pdf`,
				},
			]);

			await insertControl({
				controlType: "eye_protection",
				profileId: profile.id,
				tenantId: tenantA.tenantId,
			});

			const read = await detailRoute.GET(
				request({
					sessionCookie: session.cookieValue,
					url: `https://app.example.test/api/chemicals/${profile.id}`,
				}),
				{ params: { id: profile.id } },
			);
			assert.equal(read.status, 200);
			const readProfile = profilePayload(await read.json());
			assert.deepEqual(readProfile.controls, [
				{ controlType: "eye_protection", count: 1, pendingCount: 1 },
			]);

			const crossTenantRead = await detailRoute.GET(
				request({
					sessionCookie: tenantBSession.cookieValue,
					url: `https://app.example.test/api/chemicals/${profile.id}`,
				}),
				{ params: { id: profile.id } },
			);
			assert.equal(crossTenantRead.status, 404);

			const invalidUpdate = await detailRoute.PATCH(
				request({
					body: {
						manufacturer: "Example Supplier",
						productName: "Fixture solvent",
						storagePath: `tenants/${otherTenantId}/attachments/sds.pdf`,
					},
					csrf,
					method: "PATCH",
					sessionCookie: session.cookieValue,
					url: `https://app.example.test/api/chemicals/${profile.id}`,
				}),
				{ params: { id: profile.id } },
			);
			assert.equal(invalidUpdate.status, 400);
			assert.equal(
				record(await invalidUpdate.json()).code,
				"INVALID_CHEMICAL_PROFILE_PAYLOAD",
			);

			const updated = await detailRoute.PATCH(
				request({
					body: {
						manufacturer: "Example Supplier AG",
						productName: "Fixture solvent revised",
						profileStatus: "active",
					},
					csrf,
					method: "PATCH",
					sessionCookie: session.cookieValue,
					url: `https://app.example.test/api/chemicals/${profile.id}`,
				}),
				{ params: { id: profile.id } },
			);
			assert.equal(updated.status, 200);
			const updatedProfile = profilePayload(await updated.json());
			assert.equal(updatedProfile.productName, "Fixture solvent revised");
			assert.equal(updatedProfile.profileStatus, "active");
			assert.deepEqual(updatedProfile.sdsAttachments, [
				{
					fileName: "fixture-solvent-sds.pdf",
					storagePath: `tenants/${tenantA.tenantId}/attachments/fixture-solvent-sds.pdf`,
				},
			]);

			const archived = await detailRoute.DELETE(
				request({
					csrf,
					method: "DELETE",
					sessionCookie: session.cookieValue,
					url: `https://app.example.test/api/chemicals/${profile.id}`,
				}),
				{ params: { id: profile.id } },
			);
			assert.equal(archived.status, 200);
			assert.equal(
				profilePayload(await archived.json()).profileStatus,
				"archived",
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
				name: `ssfw-755h-${label}-${randomUUID()}`,
			},
		});
		const user = await prisma.user.create({
			data: {
				email: `ssfw-755h-${label}-${randomUUID()}@example.invalid`,
				uiLocale: "en",
			},
		});
		await prisma.tenantMembership.create({
			data: {
				tenantId: tenant.id,
				userId: user.id,
			},
		});
		await provisionChemicalSchemas(tenant.id);
		return { tenantId: tenant.id, userId: user.id };
	}

	async function provisionChemicalSchemas(tenantId: string): Promise<void> {
		const names = tenantDatabaseNames(tenantId);

		await prisma.$executeRawUnsafe(
			`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${sqlString(
				names.roleName,
			)}) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', ${sqlString(
				names.roleName,
			)}); END IF; END $$`,
		);
		await prisma.$executeRawUnsafe(
			`GRANT ${quoteIdent(names.roleName)} TO CURRENT_USER`,
		);
		await prisma.$executeRawUnsafe(
			`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(names.schemaName)} AUTHORIZATION ${quoteIdent(
				names.roleName,
			)}`,
		);
		await prisma.$executeRawUnsafe(
			`ALTER SCHEMA ${quoteIdent(names.schemaName)} OWNER TO ${quoteIdent(
				names.roleName,
			)}`,
		);
		await prisma.$executeRawUnsafe(
			`GRANT USAGE ON SCHEMA ${quoteIdent(names.schemaName)} TO ${quoteIdent(
				names.roleName,
			)}`,
		);
		await prisma.$executeRawUnsafe(
			`GRANT USAGE ON SCHEMA "shared" TO ${quoteIdent(names.roleName)}`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.apply_chemical_profile_schema(${sqlString(
				names.schemaName,
			)}::name)`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.apply_chemical_control_schema(${sqlString(
				names.schemaName,
			)}::name)`,
		);
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

	async function insertControl(input: {
		controlType: string;
		profileId: string;
		tenantId: string;
	}): Promise<void> {
		await withTenantConnection(input.tenantId, async (tx) => {
			await tx.$executeRaw`
				INSERT INTO chemical_control (
					id,
					chemical_profile_id,
					control_type,
					control_text
				) VALUES (
					${randomUUID()}::uuid,
					${input.profileId}::uuid,
					${input.controlType}::chemical_control_type,
					'Wear splash goggles'
				)
			`;
		});
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

type RouteProfile = {
	controls?: unknown;
	extractionStatus?: unknown;
	id: string;
	productName?: unknown;
	profileStatus?: unknown;
	sdsAttachments?: unknown;
};

function profilePayload(payload: unknown): RouteProfile {
	const profile = record(record(payload).profile);
	assert.equal(typeof profile.id, "string");
	return profile as RouteProfile;
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

function quoteIdent(value: string): string {
	return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${String(value).replaceAll("'", "''")}'`;
}
