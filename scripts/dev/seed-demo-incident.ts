/**
 * Dev bootstrap: ensures the dev workspace exists (same shape as
 * /api/auth/dev-session) and seeds a demo incident, then prints the coach URL.
 *
 * Run: node --env-file=.env --experimental-strip-types scripts/dev/seed-demo-incident.ts
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
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
			return { shortCircuit: true, url: resolved.href };
		}

		return nextResolve(specifier, context);
	},
});

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(relativePath).href;
}

function readEnv(name: string, legacyName: string): string | undefined {
	const value = process.env[name]?.trim();
	if (value) {
		return value;
	}

	return process.env[legacyName]?.trim() || undefined;
}

const { prisma, provisionTenantSchema, withTenantConnection } = (await import(
	moduleUrl("src/lib/db/index.ts")
)) as typeof import("../../src/lib/db/index");
const { DISCLAIMER_VERSION } = (await import(
	moduleUrl("src/lib/legal/disclaimer.ts")
)) as typeof import("../../src/lib/legal/disclaimer");

const devEmail = (
	readEnv("SAFETYSECRETARY_DEV_AUTH_EMAIL", "SSFW_DEV_AUTH_EMAIL") ??
	"tester@safetysecretary.local"
)
	.trim()
	.toLowerCase();
const companyName =
	readEnv(
		"SAFETYSECRETARY_DEV_AUTH_COMPANY_NAME",
		"SSFW_DEV_AUTH_COMPANY_NAME",
	) || "Safety Secretary Test Workspace";
const demoTitle = "Forklift reversed close to pedestrian at gate 3";

async function main(): Promise<void> {
	const workspace = await ensureDevWorkspace();
	const incidentId = await ensureDemoIncident(
		workspace.tenantId,
		workspace.userId,
	);

	console.log("Dev workspace ready.");
	console.log(`  user:     ${devEmail}`);
	console.log(`  tenant:   ${workspace.tenantId}`);
	console.log(`  incident: ${incidentId}`);
	console.log("");
	console.log("Start the app with: pnpm dev");
	console.log("Then sign in via the dev button on /signin and open:");
	console.log(`  http://localhost:3000/incidents/${incidentId}/coach`);
}

async function ensureDevWorkspace(): Promise<{
	tenantId: string;
	userId: string;
}> {
	return prisma.$transaction(
		async (tx) => {
			const user = await tx.user.upsert({
				create: { email: devEmail, uiLocale: "en" },
				update: {},
				where: { email: devEmail },
			});
			const existingMembership = await tx.tenantMembership.findFirst({
				orderBy: { createdAt: "asc" },
				where: { tenant: { deletedAt: null }, userId: user.id },
			});

			const tenantId = existingMembership
				? existingMembership.tenantId
				: await (async () => {
						const tenant = await tx.tenant.create({
							data: { defaultLanguage: "en", name: companyName },
						});
						await provisionTenantSchema(tenant.id, tx);
						await tx.tenantMembership.create({
							data: { tenantId: tenant.id, userId: user.id },
						});
						return tenant.id;
					})();

			// Coach photo analysis needs the company-level vision switch on.
			await tx.tenant.update({
				data: { visionEnabled: true },
				where: { id: tenantId },
			});

			await tx.userAcknowledgement.upsert({
				create: { disclaimerVersion: DISCLAIMER_VERSION, userId: user.id },
				update: { acknowledgedAt: new Date() },
				where: {
					userId_disclaimerVersion: {
						disclaimerVersion: DISCLAIMER_VERSION,
						userId: user.id,
					},
				},
			});

			return { tenantId, userId: user.id };
		},
		{ timeout: 20_000 },
	);
}

async function ensureDemoIncident(
	tenantId: string,
	userId: string,
): Promise<string> {
	return withTenantConnection(tenantId, async (tx) => {
		const existing = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id::text AS id
			FROM incident_case
			WHERE title = ${demoTitle}
			LIMIT 1
		`;

		if (existing[0]) {
			return existing[0].id;
		}

		const incidentId = randomUUID();
		await tx.$executeRaw`
			INSERT INTO incident_case (
				id,
				case_number,
				title,
				incident_at,
				incident_type,
				actual_injury_outcome,
				coordinator_role,
				content_language,
				created_by
			) VALUES (
				${incidentId}::uuid,
				'DEMO-001',
				${demoTitle},
				CURRENT_TIMESTAMP - INTERVAL '3 hours',
				'NEAR_MISS'::incident_type,
				'NO_INJURY'::incident_actual_injury_outcome,
				'Investigation coordinator',
				'en'::shared.language_code,
				${userId}::uuid
			)
		`;

		return incidentId;
	});
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
