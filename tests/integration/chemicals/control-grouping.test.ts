import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
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

const { listChemicalControlGroups } = (await import(
	moduleUrl("src/lib/chemicals/control-grouping.ts")
)) as typeof import("../../../src/lib/chemicals/control-grouping");
const { dropTenantSchema, prisma, tenantDatabaseNames, withTenantConnection } =
	(await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	test("chemical control grouping query", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	test("chemical control grouping query groups controls by type and text within one tenant", async () => {
		ensureMigrated();
		const tenantA = await seedTenant("a");
		const tenantB = await seedTenant("b");

		try {
			const solventId = randomUUID();
			const resinId = randomUUID();

			await insertProfile({
				manufacturer: "Example Supplier",
				productName: "Fixture solvent",
				profileId: solventId,
				tenantId: tenantA.tenantId,
			});
			await insertProfile({
				manufacturer: "Example Supplier",
				productName: "Fixture resin",
				profileId: resinId,
				tenantId: tenantA.tenantId,
			});
			await insertControl({
				controlText: "Nitrile gloves",
				controlType: "glove_type",
				profileId: solventId,
				tenantId: tenantA.tenantId,
			});
			await insertControl({
				controlText: "Nitrile gloves",
				controlType: "glove_type",
				profileId: resinId,
				tenantId: tenantA.tenantId,
			});
			await insertControl({
				controlText: "Keep container closed",
				controlType: "storage",
				profileId: solventId,
				tenantId: tenantA.tenantId,
			});

			const groups = await listChemicalControlGroups(tenantA.tenantId);
			const gloveGroup = groups.find(
				(group) =>
					group.controlType === "glove_type" &&
					group.controlText === "Nitrile gloves",
			);

			assert.ok(gloveGroup);
			assert.equal(gloveGroup.controlCount, 2);
			assert.equal(gloveGroup.profileCount, 2);
			assert.deepEqual(
				gloveGroup.profiles.map((profile) => profile.productName),
				["Fixture resin", "Fixture solvent"],
			);
			assert.deepEqual(
				gloveGroup.profiles.map((profile) => profile.profileStatus),
				["active", "active"],
			);

			const storageGroup = groups.find(
				(group) =>
					group.controlType === "storage" &&
					group.controlText === "Keep container closed",
			);
			assert.ok(storageGroup);
			assert.equal(storageGroup.profileCount, 1);

			assert.deepEqual(await listChemicalControlGroups(tenantB.tenantId), []);
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});
}

async function seedTenant(label: string): Promise<{
	tenantId: string;
	userId: string;
}> {
	const tenant = await prisma.tenant.create({
		data: {
			defaultLanguage: "en",
			name: `ssfw-i94s-${label}-${randomUUID()}`,
		},
	});
	const user = await prisma.user.create({
		data: {
			email: `ssfw-i94s-${label}-${randomUUID()}@example.invalid`,
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

async function insertProfile(input: {
	manufacturer: string;
	productName: string;
	profileId: string;
	tenantId: string;
}): Promise<void> {
	await withTenantConnection(input.tenantId, async (tx) => {
		await tx.$executeRaw`
			INSERT INTO chemical_profile (
				id,
				tenant_id,
				product_name,
				manufacturer,
				profile_status
			) VALUES (
				${input.profileId}::uuid,
				${input.tenantId}::uuid,
				${input.productName},
				${input.manufacturer},
				'active'::chemical_profile_status
			)
		`;
	});
}

async function insertControl(input: {
	controlText: string;
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
				${input.controlText}
			)
		`;
	});
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

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}
