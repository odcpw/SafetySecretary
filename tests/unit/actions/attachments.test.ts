import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
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

const attachmentsModulePath = pathToFileURL(
	path.resolve("src/lib/actions/attachments.ts"),
).href;
const keysModulePath = pathToFileURL(
	path.resolve("src/lib/storage/keys.ts"),
).href;
const {
	actionAttachmentRelativeKey,
	actionAttachmentRelativeKeyFromStoragePath,
	ActionAttachmentValidationError,
	extensionForActionAttachmentMimeType,
} = (await import(
	attachmentsModulePath
)) as typeof import("../../../src/lib/actions/attachments");
const { tenantPrefix } = (await import(
	keysModulePath
)) as typeof import("../../../src/lib/storage/keys");

const tenantId = "11111111-1111-4111-8111-111111111111";
const attachmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("action attachment content-type allow-list maps to storage extensions", () => {
	assert.equal(extensionForActionAttachmentMimeType("image/png"), "png");
	assert.equal(extensionForActionAttachmentMimeType("IMAGE/JPEG"), "jpg");
	assert.equal(extensionForActionAttachmentMimeType("application/pdf"), "pdf");
	assert.equal(
		extensionForActionAttachmentMimeType(
			"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		),
		"pptx",
	);
	assert.throws(
		() => extensionForActionAttachmentMimeType("text/html"),
		ActionAttachmentValidationError,
	);
});

test("action attachment storage keys are tenant-relative and validate components", () => {
	assert.equal(
		actionAttachmentRelativeKey(attachmentId, ".PNG"),
		"attachments/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
	);

	assert.throws(
		() => actionAttachmentRelativeKey("not-a-uuid", "png"),
		ActionAttachmentValidationError,
	);
	assert.throws(
		() => actionAttachmentRelativeKey(attachmentId, "../png"),
		ActionAttachmentValidationError,
	);
});

test("action attachment storage path resolution rejects cross-tenant keys", () => {
	assert.equal(
		actionAttachmentRelativeKeyFromStoragePath(
			tenantId,
			`${tenantPrefix(tenantId)}/attachments/${attachmentId}.png`,
		),
		`attachments/${attachmentId}.png`,
	);

	assert.throws(
		() =>
			actionAttachmentRelativeKeyFromStoragePath(
				tenantId,
				"tenants/22222222-2222-4222-8222-222222222222/attachments/a.png",
			),
		ActionAttachmentValidationError,
	);
});
