import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { ValidatedSession } from "../../../src/lib/auth/session";
import type { DispatchResult } from "../../../src/lib/llm/dispatch";
import type {
	Storage,
	StorageBody,
	StorageListResult,
	StorageObject,
	StorageObjectMetadata,
	StoragePutOptions,
} from "../../../src/lib/storage";

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
	test("SDS extraction route", { skip: "DATABASE_URL is required" }, () => {});
} else {
	const { NextRequest } = (await import(
		"next/server"
	)) as typeof import("next/server");
	const detailRoute = (await import(
		moduleUrl("src/app/api/chemicals/[id]/route.ts")
	)) as typeof import("../../../src/app/api/chemicals/[id]/route");
	const route = (await import(
		moduleUrl("src/app/api/chemicals/[id]/sds/route.ts")
	)) as typeof import("../../../src/app/api/chemicals/[id]/sds/route");
	const { issueSession } = (await import(
		moduleUrl("src/lib/auth/session.ts")
	)) as typeof import("../../../src/lib/auth/session");
	const { createChemicalProfile } = (await import(
		moduleUrl("src/lib/chemicals/queries.ts")
	)) as typeof import("../../../src/lib/chemicals/queries");
	const { listChemicalRecapCards } = (await import(
		moduleUrl("src/lib/chemicals/recap-queries.ts")
	)) as typeof import("../../../src/lib/chemicals/recap-queries");
	const { dropTenantSchema, prisma, tenantDatabaseNames } = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");

	test("SDS upload stores file, extracts pending controls, and requires review before operational use", async () => {
		ensureMigrated();
		const tenantA = await seedTenant("a");
		const tenantB = await seedTenant("b");
		const storage = new MemoryStorage();
		const csrf = randomUUID();
		const tenantASession = await issueSession(tenantA.userId, tenantA.tenantId);

		try {
			const profile = await createChemicalProfile({
				profile: {
					manufacturer: "Example Supplier",
					productName: "Synthetic solvent A",
				},
				tenantId: tenantA.tenantId,
			});
			const crossTenantUpload = await route.handleSdsUploadAndExtraction(
				sdsUploadRequest({
					csrf,
					filename: "cross-tenant-sds.txt",
					sessionCookie: "tenant-b-session",
					sdsText:
						"Section 8 says use local exhaust ventilation. Section 4 says rinse cautiously with water.",
				}),
				{ params: { id: profile.id } },
				{
					sessionValidator: validatorFor(tenantB, "tenant-b-session"),
					storage,
				},
			);
			assert.equal(crossTenantUpload.status, 404);
			assert.equal(storage.objects.size, 0);

			const unsupportedSource = await route.handleSdsUploadAndExtraction(
				sdsUploadRequest({
					contentType: "application/pdf",
					csrf,
					filename: "synthetic-solvent-sds.pdf",
					sessionCookie: "tenant-a-session",
					sdsText:
						"Section 8 says use local exhaust ventilation. Section 4 says rinse cautiously with water.",
				}),
				{ params: { id: profile.id } },
				{
					sessionValidator: validatorFor(tenantA, "tenant-a-session"),
					storage,
				},
			);
			assert.equal(unsupportedSource.status, 415);
			assert.equal(storage.objects.size, 0);

			const extractionResponse = JSON.stringify({
				controls: [
					{
						confidence: 0.83,
						controlText: "Use local exhaust ventilation",
						controlType: "use_control",
						pageLineRef: "p. 4",
						sdsSection: "Section 8 - Exposure Controls",
						sourceExcerpt: "Use local exhaust ventilation.",
					},
					{
						confidence: 0.7,
						controlText: "Rinse eyes with water for several minutes",
						controlType: "first_aid",
						sdsSection: "Section 4 - First aid",
						sourceExcerpt: "Rinse cautiously with water for several minutes.",
					},
				],
			});

			const upload = await route.handleSdsUploadAndExtraction(
				sdsUploadRequest({
					csrf,
					filename: "synthetic-solvent-sds.txt",
					sessionCookie: "tenant-a-session",
					sdsText:
						"Section 8 says use local exhaust ventilation. Section 4 says rinse cautiously with water.",
				}),
				{ params: { id: profile.id } },
				{
					dispatchSdsExtraction: async (req): Promise<DispatchResult> => {
						assert.equal(req.options.requiresVision, false);
						assert.equal(
							req.options.promptPurpose,
							"chemical.sds.extract-controls",
						);
						assert.match(req.prompt, /Synthetic solvent A/);
						return {
							ok: true,
							providerStep: "mock",
							response: {
								model: "mock-sds-extractor",
								provider: "mock",
								text: extractionResponse,
							},
						};
					},
					sessionValidator: validatorFor(tenantA, "tenant-a-session"),
					storage,
				},
			);

			assert.equal(upload.status, 201);
			const uploadedProfile = profilePayload(await upload.json());
			assert.equal(uploadedProfile.extractionStatus, "review_required");
			assert.equal(uploadedProfile.sdsAttachments.length, 1);
			assert.equal(uploadedProfile.sdsControls.length, 2);
			assert.deepEqual(
				uploadedProfile.sdsControls.map((control) => control.reviewStatus),
				["pending", "pending"],
			);
			assert.deepEqual(
				uploadedProfile.sdsControls.map((control) => ({
					confidence: control.extractionConfidence,
					model: control.extractionModelMarker,
					section: control.sdsSection,
					sourceFilename: control.sourceFilename,
				})),
				[
					{
						confidence: 0.83,
						model: "mock:mock-sds-extractor",
						section: "Section 8 - Exposure Controls",
						sourceFilename: "synthetic-solvent-sds.txt",
					},
					{
						confidence: 0.7,
						model: "mock:mock-sds-extractor",
						section: "Section 4 - First aid",
						sourceFilename: "synthetic-solvent-sds.txt",
					},
				],
			);
			assert.equal(storage.objects.size, 1);
			assert.equal(
				await listChemicalRecapCards(tenantA.tenantId).then(
					(rows) => rows.length,
				),
				0,
			);

			const crossTenantReview = await route.handleSdsControlReview(
				jsonRequest({
					body: {
						controlId: uploadedProfile.sdsControls[0].id,
						decision: "approved",
					},
					csrf,
					method: "PATCH",
					sessionCookie: "tenant-b-session",
					url: `https://app.example.test/api/chemicals/${profile.id}/sds`,
				}),
				{ params: { id: profile.id } },
				{
					sessionValidator: validatorFor(tenantB, "tenant-b-session"),
				},
			);
			assert.equal(crossTenantReview.status, 404);

			const approved = await route.handleSdsControlReview(
				jsonRequest({
					body: {
						controlId: uploadedProfile.sdsControls[0].id,
						decision: "approved",
					},
					csrf,
					method: "PATCH",
					sessionCookie: "tenant-a-session",
					url: `https://app.example.test/api/chemicals/${profile.id}/sds`,
				}),
				{ params: { id: profile.id } },
				{
					now: new Date("2026-05-06T08:00:00.000Z"),
					sessionValidator: validatorFor(tenantA, "tenant-a-session"),
				},
			);
			assert.equal(approved.status, 200);
			const approvedProfile = profilePayload(await approved.json());
			assert.equal(approvedProfile.sdsControls[0].reviewStatus, "approved");
			assert.equal(
				approvedProfile.sdsControls[0].reviewedByUserId,
				tenantA.userId,
			);
			assert.equal(approvedProfile.sdsControls[1].reviewStatus, "pending");
			assert.deepEqual(
				(await listChemicalRecapCards(tenantA.tenantId)).flatMap((card) =>
					card.controls.map((control) => control.controlText),
				),
				["Use local exhaust ventilation"],
			);

			const rejected = await route.handleSdsControlReview(
				jsonRequest({
					body: {
						controlId: uploadedProfile.sdsControls[1].id,
						decision: "rejected",
					},
					csrf,
					method: "PATCH",
					sessionCookie: "tenant-a-session",
					url: `https://app.example.test/api/chemicals/${profile.id}/sds`,
				}),
				{ params: { id: profile.id } },
				{
					now: new Date("2026-05-06T08:05:00.000Z"),
					sessionValidator: validatorFor(tenantA, "tenant-a-session"),
				},
			);
			assert.equal(rejected.status, 200);
			const finalProfile = profilePayload(await rejected.json());
			const staleStoragePath = finalProfile.sdsControls[0].sourceStoragePath;
			assert.equal(finalProfile.extractionStatus, "approved");
			assert.deepEqual(
				finalProfile.sdsControls.map((control) => control.reviewStatus),
				["approved", "rejected"],
			);
			assert.deepEqual(
				(await listChemicalRecapCards(tenantA.tenantId)).flatMap((card) =>
					card.controls.map((control) => control.controlText),
				),
				["Use local exhaust ventilation"],
			);

			const replacementResponse = JSON.stringify({
				controls: [
					{
						confidence: 0.91,
						controlText: "Keep containers closed in a ventilated store",
						controlType: "storage",
						sdsSection: "Section 7 - Handling and storage",
						sourceExcerpt:
							"Keep container tightly closed in a well-ventilated place.",
					},
				],
			});
			const replacement = await route.handleSdsUploadAndExtraction(
				sdsUploadRequest({
					csrf,
					filename: "replacement-sds.txt",
					sessionCookie: "tenant-a-session",
					sdsText:
						"Section 7 says keep container tightly closed in a well-ventilated place.",
				}),
				{ params: { id: profile.id } },
				{
					dispatchSdsExtraction: async (): Promise<DispatchResult> => ({
						ok: true,
						providerStep: "mock",
						response: {
							model: "mock-sds-extractor-v2",
							provider: "mock",
							text: replacementResponse,
						},
					}),
					sessionValidator: validatorFor(tenantA, "tenant-a-session"),
					storage,
				},
			);
			assert.equal(replacement.status, 201);
			const replacementProfile = profilePayload(await replacement.json());
			assert.equal(replacementProfile.extractionStatus, "review_required");
			assert.equal(replacementProfile.sdsControls.length, 1);
			assert.equal(replacementProfile.sdsControls[0].reviewStatus, "pending");
			assert.equal(
				replacementProfile.sdsControls[0].sourceFilename,
				"replacement-sds.txt",
			);
			const staleStoragePathEdit = await detailRoute.PATCH(
				new NextRequest(
					`https://app.example.test/api/chemicals/${profile.id}`,
					{
						body: JSON.stringify({
							manufacturer: "Example Supplier",
							productName: "Synthetic solvent A",
							storagePath: staleStoragePath,
						}),
						headers: {
							"content-type": "application/json",
							cookie: `ssfw_session=${tenantASession.cookieValue}; ssfw_csrf=${csrf}`,
							"x-ssfw-csrf": csrf,
						},
						method: "PATCH",
					},
				),
				{ params: { id: profile.id } },
			);
			assert.equal(staleStoragePathEdit.status, 400);
			assert.deepEqual(
				(await listChemicalRecapCards(tenantA.tenantId)).flatMap((card) =>
					card.controls.map((control) => control.controlText),
				),
				[],
			);

			const staleControlReview = await route.handleSdsControlReview(
				jsonRequest({
					body: {
						controlId: finalProfile.sdsControls[0].id,
						decision: "approved",
					},
					csrf,
					method: "PATCH",
					sessionCookie: "tenant-a-session",
					url: `https://app.example.test/api/chemicals/${profile.id}/sds`,
				}),
				{ params: { id: profile.id } },
				{
					sessionValidator: validatorFor(tenantA, "tenant-a-session"),
				},
			);
			assert.equal(staleControlReview.status, 404);

			const replacementApproved = await route.handleSdsControlReview(
				jsonRequest({
					body: {
						controlId: replacementProfile.sdsControls[0].id,
						decision: "approved",
					},
					csrf,
					method: "PATCH",
					sessionCookie: "tenant-a-session",
					url: `https://app.example.test/api/chemicals/${profile.id}/sds`,
				}),
				{ params: { id: profile.id } },
				{
					sessionValidator: validatorFor(tenantA, "tenant-a-session"),
				},
			);
			assert.equal(replacementApproved.status, 200);
			assert.deepEqual(
				(await listChemicalRecapCards(tenantA.tenantId)).flatMap((card) =>
					card.controls.map((control) => control.controlText),
				),
				["Keep containers closed in a ventilated store"],
			);
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});

	async function seedTenant(label: string): Promise<SeededTenant> {
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-mfly-${label}-${randomUUID()}`,
			},
		});
		const user = await prisma.user.create({
			data: {
				email: `ssfw-mfly-${label}-${randomUUID()}@example.invalid`,
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

	async function cleanupTenant(input: SeededTenant): Promise<void> {
		await dropTenantSchema(input.tenantId).catch(() => undefined);
		await prisma.tenantMembership.deleteMany({
			where: { tenantId: input.tenantId },
		});
		await prisma.session.deleteMany({ where: { tenantId: input.tenantId } });
		await prisma.tenant.deleteMany({ where: { id: input.tenantId } });
		await prisma.user.deleteMany({ where: { id: input.userId } });
	}
}

type SeededTenant = {
	tenantId: string;
	userId: string;
};

type SerializedSdsControl = {
	id: string;
	controlText: string;
	extractionConfidence: number | null;
	extractionModelMarker: string;
	reviewStatus: string;
	reviewedByUserId: string | null;
	sdsSection: string;
	sourceFilename: string;
	sourceStoragePath: string;
};

type SerializedProfile = {
	extractionStatus: string;
	sdsAttachments: readonly unknown[];
	sdsControls: readonly SerializedSdsControl[];
};

function validatorFor(tenant: SeededTenant, expectedCookie: string) {
	return async (
		cookieValue: string | null | undefined,
	): Promise<ValidatedSession | null> => {
		if (cookieValue !== expectedCookie) {
			return null;
		}

		return {
			deviceHint: "desktop",
			expiresAt: new Date("2026-05-07T08:00:00.000Z"),
			id: randomUUID(),
			lastSeenAt: new Date("2026-05-06T08:00:00.000Z"),
			tenantId: tenant.tenantId,
			userId: tenant.userId,
		};
	};
}

function sdsUploadRequest(input: {
	contentType?: string;
	csrf: string;
	filename: string;
	sessionCookie: string;
	sdsText: string;
}) {
	const formData = new FormData();
	formData.set(
		"file",
		new File([Buffer.from(input.sdsText)], input.filename, {
			type: input.contentType ?? "text/plain",
		}),
	);

	return new Request("https://app.example.test/api/chemicals/profile/sds", {
		body: formData,
		headers: {
			cookie: `ssfw_session=${input.sessionCookie}; ssfw_csrf=${input.csrf}`,
			"x-ssfw-csrf": input.csrf,
		},
		method: "POST",
	});
}

function jsonRequest(input: {
	body: Record<string, unknown>;
	csrf: string;
	method: string;
	sessionCookie: string;
	url: string;
}) {
	return new Request(input.url, {
		body: JSON.stringify(input.body),
		headers: {
			"content-type": "application/json",
			cookie: `ssfw_session=${input.sessionCookie}; ssfw_csrf=${input.csrf}`,
			"x-ssfw-csrf": input.csrf,
		},
		method: input.method,
	});
}

function profilePayload(payload: unknown): SerializedProfile {
	const body = record(payload);
	const profile = record(body.profile) as unknown as SerializedProfile;
	assert.ok(Array.isArray(profile.sdsAttachments));
	assert.ok(Array.isArray(profile.sdsControls));
	return profile;
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

class MemoryStorage implements Storage {
	readonly objects = new Map<
		string,
		StorageObjectMetadata & { body: Buffer }
	>();

	async put(
		key: string,
		body: StorageBody,
		options: StoragePutOptions = {},
	): Promise<StorageObjectMetadata> {
		const buffer = Buffer.from(body as Buffer);
		const metadata: StorageObjectMetadata & { body: Buffer } = {
			body: buffer,
			contentType: options.contentType,
			customMetadata: options.customMetadata,
			key,
			sizeBytes: options.sizeBytes ?? buffer.byteLength,
			updatedAt: new Date("2026-05-06T08:00:00.000Z"),
		};
		this.objects.set(key, metadata);
		return metadata;
	}

	async get(key: string): Promise<StorageObject> {
		const object = this.objects.get(key);
		if (!object) {
			throw new Error("not found");
		}
		return { body: object.body, metadata: object };
	}

	async head(key: string): Promise<StorageObjectMetadata> {
		const object = this.objects.get(key);
		if (!object) {
			throw new Error("not found");
		}
		return object;
	}

	async delete(key: string): Promise<void> {
		this.objects.delete(key);
	}

	async list(prefix: string): Promise<StorageListResult> {
		return {
			items: [...this.objects.values()].filter((item) =>
				item.key.startsWith(prefix),
			),
			truncated: false,
		};
	}
}
