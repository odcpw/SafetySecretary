import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import type {
	EmailTransport,
	MagicLinkEmail,
} from "../../../src/lib/email/transport";

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
	test("auth route UI-locale integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const { NextRequest } = (await import(
		"next/server.js"
	)) as typeof import("next/server");
	const signupRoute = (await import(
		moduleUrl("src/app/api/auth/signup/route.ts")
	)) as typeof import("../../../src/app/api/auth/signup/route");
	const verifyRoute = (await import(
		moduleUrl("src/app/api/auth/magic-link/verify/route.ts")
	)) as typeof import("../../../src/app/api/auth/magic-link/verify/route");
	const { requestMagicLink } = (await import(
		moduleUrl("src/lib/auth/magic-link.ts")
	)) as typeof import("../../../src/lib/auth/magic-link");
	const { prisma, dropTenantSchema } = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");

	test("signup route requests a magic link without provisioning a workspace", async () => {
		ensureMigrated();

		const email = `ssfw-esv-signup-${randomUUID()}@example.invalid`;
		const tempDir = await mkdtemp(path.join(tmpdir(), "ssfw-esv-signup-"));
		const previousEmailTransport = process.env.EMAIL_TRANSPORT;
		const previousEmailLog = process.env.MAGIC_LINK_DEV_EMAIL_LOG;
		const previousBaseUrl = process.env.APP_BASE_URL;

		process.env.EMAIL_TRANSPORT = "dev";
		process.env.MAGIC_LINK_DEV_EMAIL_LOG = path.join(tempDir, "mail.jsonl");
		process.env.APP_BASE_URL = "https://app.example.test";

		try {
			const response = await signupRoute.POST(
				new NextRequest("https://app.example.test/api/auth/signup", {
					method: "POST",
					headers: {
						"accept-language": "fr",
						"content-type": "application/json",
					},
					body: JSON.stringify({
						email,
						companyName: "Locale Signup AG",
						defaultLanguage: "en",
					}),
				}),
			);

			assert.equal(response.status, 202);

			const user = await prisma.user.findUnique({
				where: { email },
			});
			const tokenCount = await prisma.magicLinkToken.count({
				where: { email },
			});

			assert.equal(user, null);
			assert.equal(tokenCount, 1);
			console.log(
				`DB inspection signup request: user_created=${user !== null}; magic_link_tokens=${tokenCount}`,
			);
		} finally {
			await prisma.magicLinkToken.deleteMany({ where: { email } });
			await prisma.user.deleteMany({ where: { email } });
			await rm(tempDir, { recursive: true, force: true });
			setOptionalEnv("EMAIL_TRANSPORT", previousEmailTransport);
			setOptionalEnv("MAGIC_LINK_DEV_EMAIL_LOG", previousEmailLog);
			setOptionalEnv("APP_BASE_URL", previousBaseUrl);
		}
	});

	test("verify route sets null User.uiLocale once and never overwrites it", async () => {
		ensureMigrated();

		const email = `ssfw-esv-verify-${randomUUID()}@example.invalid`;
		const tenant = await prisma.tenant.create({
			data: {
				name: "Locale Verify AG",
				defaultLanguage: "en",
			},
		});
		const user = await prisma.user.create({
			data: {
				email,
			},
		});
		await prisma.tenantMembership.create({
			data: {
				tenantId: tenant.id,
				userId: user.id,
			},
		});

		try {
			const firstToken = await createMagicLinkToken(email, tenant.id);
			const prefetchResponse = await verifyRoute.GET(
				new NextRequest(
					`https://app.example.test/api/auth/magic-link/verify?token=${encodeURIComponent(
						firstToken,
					)}`,
					{
						headers: {
							accept: "text/html",
						},
					},
				),
			);
			assert.equal(prefetchResponse.status, 200);
			assert.equal(prefetchResponse.headers.get("cache-control"), "no-store");

			const afterPrefetch = await prisma.user.findUniqueOrThrow({
				where: { id: user.id },
				select: { uiLocale: true },
			});
			assert.equal(afterPrefetch.uiLocale, null);

			const rejectedResponse = await verifyRoute.POST(
				new NextRequest(
					`https://app.example.test/api/auth/magic-link/verify?token=${encodeURIComponent(
						firstToken,
					)}`,
					{
						method: "POST",
						headers: {
							origin: "https://evil.example.test",
							"user-agent": "desktop",
						},
					},
				),
			);
			assert.equal(rejectedResponse.status, 403);

			const firstResponse = await verifyRoute.POST(
				new NextRequest(
					`https://app.example.test/api/auth/magic-link/verify?token=${encodeURIComponent(
						firstToken,
					)}`,
					{
						method: "POST",
						headers: {
							"accept-language": "de-CH;q=0.9,en;q=0.7",
							origin: "https://app.example.test",
							"user-agent": "desktop",
						},
					},
				),
			);
			assert.equal(firstResponse.status, 200);

			const afterFirst = await prisma.user.findUniqueOrThrow({
				where: { id: user.id },
				select: { uiLocale: true },
			});
			assert.equal(afterFirst.uiLocale, "de");

			const secondToken = await createMagicLinkToken(email, tenant.id);
			const secondResponse = await verifyRoute.POST(
				new NextRequest(
					`https://app.example.test/api/auth/magic-link/verify?token=${encodeURIComponent(
						secondToken,
					)}`,
					{
						method: "POST",
						headers: {
							"accept-language": "fr",
							"user-agent": "desktop",
						},
					},
				),
			);
			assert.equal(secondResponse.status, 200);

			const afterSecond = await prisma.user.findUniqueOrThrow({
				where: { id: user.id },
				select: { uiLocale: true },
			});
			assert.equal(afterSecond.uiLocale, "de");
			console.log(
				`DB inspection verify: first shared.users.ui_locale=${afterFirst.uiLocale}; second shared.users.ui_locale=${afterSecond.uiLocale}`,
			);
		} finally {
			await cleanupTenant(prisma, tenant.id);
			await cleanupUser(prisma, user.id, email);
		}
	});

	test("verify route auto-provisions personal and company-domain workspaces", async () => {
		ensureMigrated();

		const suffix = randomUUID();
		const personalAEmail = `ssfw-esv-personal-a-${suffix}@gmail.com`;
		const personalBEmail = `ssfw-esv-personal-b-${suffix}@gmail.com`;
		const companyDomain = `ssfw-esv-${suffix}.example.invalid`;
		const companyAEmail = `alice@${companyDomain}`;
		const companyBEmail = `bob@${companyDomain}`;
		const emails = [
			personalAEmail,
			personalBEmail,
			companyAEmail,
			companyBEmail,
		];
		const tenantIds = new Set<string>();
		const userIds = new Set<string>();

		try {
			const personalA = await verifyUntargetedMagicLink(personalAEmail, "de");
			const personalB = await verifyUntargetedMagicLink(personalBEmail, "fr");
			const companyA = await verifyUntargetedMagicLink(companyAEmail, "en");
			const companyB = await verifyUntargetedMagicLink(companyBEmail, "it");

			for (const result of [personalA, personalB, companyA, companyB]) {
				tenantIds.add(result.tenantId);
				userIds.add(result.userId);
			}

			assert.notEqual(personalA.tenantId, personalB.tenantId);
			assert.equal(companyA.tenantId, companyB.tenantId);
			assert.notEqual(personalA.tenantId, companyA.tenantId);

			const tenants = await prisma.tenant.findMany({
				where: { id: { in: [...tenantIds] } },
				select: {
					id: true,
					workspaceKind: true,
					domains: { select: { domain: true } },
					memberships: { select: { userId: true } },
				},
			});
			const byId = new Map(tenants.map((tenant) => [tenant.id, tenant]));

			assert.equal(byId.get(personalA.tenantId)?.workspaceKind, "personal");
			assert.equal(byId.get(personalB.tenantId)?.workspaceKind, "personal");
			assert.deepEqual(byId.get(personalA.tenantId)?.domains, []);
			assert.deepEqual(byId.get(personalB.tenantId)?.domains, []);

			const companyTenant = byId.get(companyA.tenantId);
			assert.equal(companyTenant?.workspaceKind, "company");
			assert.deepEqual(companyTenant?.domains, [{ domain: companyDomain }]);
			assert.deepEqual(
				companyTenant?.memberships
					.map((membership) => membership.userId)
					.sort(),
				[companyA.userId, companyB.userId].sort(),
			);
		} finally {
			await prisma.magicLinkToken.deleteMany({
				where: { email: { in: emails } },
			});
			for (const tenantId of tenantIds) {
				await cleanupTenant(prisma, tenantId);
			}
			for (const userId of userIds) {
				await cleanupUser(prisma, userId, "");
			}
			await prisma.user.deleteMany({ where: { email: { in: emails } } });
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});

	async function createMagicLinkToken(
		email: string,
		tenantId: string,
	): Promise<string> {
		const transport = new RecordingEmailTransport();

		await requestMagicLink({
			email,
			targetTenantId: tenantId,
			transport,
			baseUrl: "https://app.example.test",
			from: "no-reply@example.test",
			now: new Date(),
		});

		assert.equal(transport.magicLinkUrls.length, 1);

		const token = new URL(transport.magicLinkUrls[0]).searchParams.get("token");
		assert.ok(token);
		return token;
	}

	async function verifyUntargetedMagicLink(
		email: string,
		acceptLanguage: string,
	): Promise<{ userId: string; tenantId: string }> {
		const transport = new RecordingEmailTransport();

		await requestMagicLink({
			email,
			transport,
			baseUrl: "https://app.example.test",
			from: "no-reply@example.test",
			now: new Date(),
		});

		assert.equal(transport.magicLinkUrls.length, 1);
		const token = new URL(transport.magicLinkUrls[0]).searchParams.get("token");
		assert.ok(token);

		const response = await verifyRoute.POST(
			new NextRequest(
				`https://app.example.test/api/auth/magic-link/verify?token=${encodeURIComponent(
					token,
				)}`,
				{
					method: "POST",
					headers: {
						"accept-language": acceptLanguage,
						"user-agent": "desktop",
					},
				},
			),
		);
		assert.equal(response.status, 200);

		const payload = (await response.json()) as {
			userId?: unknown;
			tenantId?: unknown;
		};
		if (
			typeof payload.userId !== "string" ||
			typeof payload.tenantId !== "string"
		) {
			throw new TypeError(
				"Verify route response must include userId and tenantId.",
			);
		}

		return {
			userId: payload.userId,
			tenantId: payload.tenantId,
		};
	}

	async function cleanupTenant(
		prismaClient: PrismaClient,
		tenantId: string | undefined,
	): Promise<void> {
		if (!tenantId) {
			return;
		}

		await dropTenantSchema(tenantId, prismaClient).catch(() => undefined);
		await prismaClient.tenant.deleteMany({ where: { id: tenantId } });
	}
}

let migrated = false;

function ensureMigrated(): void {
	if (migrated) {
		return;
	}

	const result = spawnSync("pnpm", ["db:migrate"], {
		cwd: process.cwd(),
		env: { ...process.env, DATABASE_URL: databaseUrl },
		encoding: "utf8",
	});

	assert.equal(
		result.status,
		0,
		`pnpm db:migrate failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);
	migrated = true;
}

class RecordingEmailTransport implements EmailTransport {
	readonly magicLinkUrls: string[] = [];

	async sendMagicLink(email: MagicLinkEmail): Promise<void> {
		this.magicLinkUrls.push(email.magicLinkUrl);
	}
}

async function cleanupUser(
	prismaClient: PrismaClient,
	userId: string | undefined,
	email: string,
): Promise<void> {
	if (!userId) {
		return;
	}

	await prismaClient.magicLinkToken.deleteMany({
		where: { email },
	});
	await prismaClient.session.deleteMany({ where: { userId } });
	await prismaClient.user.deleteMany({ where: { id: userId } });
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(path.resolve(relativePath)).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

function setOptionalEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
		return;
	}

	process.env[name] = value;
}
