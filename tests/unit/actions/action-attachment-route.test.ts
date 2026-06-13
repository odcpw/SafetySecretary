import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			specifier === "next/server" &&
			isActionAttachmentRoute(context.parentURL)
		) {
			return nextResolve("next/server.js", context);
		}

		if (
			specifier === "../../../../../lib/auth/session" &&
			isActionAttachmentRoute(context.parentURL)
		) {
			return dataModuleUrl(`
				export async function validateSession() {
					return {
						deviceHint: "desktop",
						expiresAt: new Date("2026-06-05T00:00:00.000Z"),
						id: "${sessionId}",
						lastSeenAt: new Date("2026-05-05T00:00:00.000Z"),
						tenantId: "${tenantId}",
						userId: "${userId}"
					};
				}
			`);
		}

		if (
			specifier === "../../../../../lib/actions/attachments" &&
			isActionAttachmentRoute(context.parentURL)
		) {
			return dataModuleUrl(`
				export const ACTION_ATTACHMENT_ALLOWED_CONTENT_TYPES = new Map([
					["application/pdf", "pdf"],
					["image/png", "png"]
				]);
				export class ActionAttachmentValidationError extends Error {}
				export class ActionAttachmentNotFoundError extends Error {}
				export function actionAttachmentUploadMaxBytes(env = process.env) {
					const parsed = Number.parseInt(env.STORAGE_UPLOAD_MAX_BYTES ?? "", 10);
					return Number.isFinite(parsed) && parsed > 0 ? parsed : 26214400;
				}
				export async function createActionAttachment(input) {
					globalThis.__ssfwActionAttachmentRouteCalls.push(input);
					return {
						actionItemId: input.actionItemId,
						description: input.description,
						filename: input.filename,
						id: "${attachmentId}",
						mimeType: input.mimeType,
						storagePath: "tenant/actions/${attachmentId}.pdf",
						uploadedAt: new Date("2026-05-05T00:00:00.000Z"),
						uploadedByUserId: input.uploadedByUserId
					};
				}
				export async function deleteActionAttachment() {
					return null;
				}
				export async function listActionAttachments() {
					return [];
				}
			`);
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
	path.resolve("src/app/api/actions/[id]/attachments/route.ts"),
).href;
const actionId = "11111111-1111-4111-8111-111111111111";
const attachmentId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const tenantId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const csrfValue = "csrf-action-attachment";

const { POST } = (await import(
	routeModulePath
)) as typeof import("../../../src/app/api/actions/[id]/attachments/route");

test("action attachment POST rejects oversized file before reading it", async () => {
	const previousMaxBytes = process.env.STORAGE_UPLOAD_MAX_BYTES;
	let arrayBufferCalled = false;
	globalState().__ssfwActionAttachmentRouteCalls = [];
	process.env.STORAGE_UPLOAD_MAX_BYTES = "3";

	try {
		const response = await POST(
			uploadRequest({
				async arrayBuffer() {
					arrayBufferCalled = true;
					return new Uint8Array([1, 2, 3, 4]).buffer;
				},
				name: "verification.pdf",
				size: 4,
				type: "application/pdf",
			}),
			{ params: { id: actionId } },
		);

		assert.equal(response.status, 413);
		assert.deepEqual(await response.json(), { code: "UPLOAD_TOO_LARGE" });
		assert.equal(arrayBufferCalled, false);
		assert.deepEqual(globalState().__ssfwActionAttachmentRouteCalls, []);
	} finally {
		if (previousMaxBytes === undefined) {
			delete process.env.STORAGE_UPLOAD_MAX_BYTES;
		} else {
			process.env.STORAGE_UPLOAD_MAX_BYTES = previousMaxBytes;
		}
	}
});

function uploadRequest(file: UploadedFile) {
	return {
		cookies: {
			get(name: string) {
				if (name === "ssfw_session") {
					return { value: sessionId };
				}
				if (name === "ssfw_csrf") {
					return { value: csrfValue };
				}
				return undefined;
			},
		},
		formData: async () => ({
			get(name: string) {
				return name === "file" ? file : null;
			},
		}),
		headers: new Headers({
			"content-type": "multipart/form-data; boundary=action-attachment",
			"x-ssfw-csrf": csrfValue,
		}),
	} as never;
}

type UploadedFile = {
	readonly name: string;
	readonly size: number;
	readonly type: string;
	arrayBuffer(): Promise<ArrayBuffer>;
};

function globalState(): typeof globalThis & {
	__ssfwActionAttachmentRouteCalls: unknown[];
} {
	const state = globalThis as typeof globalThis & {
		__ssfwActionAttachmentRouteCalls?: unknown[];
	};
	state.__ssfwActionAttachmentRouteCalls ??= [];
	return state as typeof globalThis & {
		__ssfwActionAttachmentRouteCalls: unknown[];
	};
}

function isActionAttachmentRoute(parentUrl: string | undefined): boolean {
	return Boolean(
		parentUrl?.endsWith("/src/app/api/actions/%5Bid%5D/attachments/route.ts"),
	);
}

function dataModuleUrl(source: string) {
	return {
		shortCircuit: true,
		url: `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`,
	};
}
