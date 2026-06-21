import assert from "node:assert/strict";
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
});

test("resolvePiSdkImportSpecifier accepts the default package and absolute paths", async () => {
	const { resolvePiSdkImportSpecifier } = await importCoachPiRuntime();
	assert.equal(
		resolvePiSdkImportSpecifier(undefined),
		"@earendil-works/pi-coding-agent",
	);
	assert.equal(
		resolvePiSdkImportSpecifier("@earendil-works/pi-coding-agent"),
		"@earendil-works/pi-coding-agent",
	);
	assert.equal(
		resolvePiSdkImportSpecifier("/opt/pi/sdk/index.mjs"),
		"file:///opt/pi/sdk/index.mjs",
	);
	assert.equal(
		resolvePiSdkImportSpecifier("file:///opt/pi/sdk/index.mjs"),
		"file:///opt/pi/sdk/index.mjs",
	);
});

test("resolvePiSdkImportSpecifier rejects relative or arbitrary package overrides", async () => {
	const { CoachPiUnavailableError, resolvePiSdkImportSpecifier } =
		await importCoachPiRuntime();
	assert.throws(
		() => resolvePiSdkImportSpecifier("./node_modules/pi/index.mjs"),
		(error: unknown) =>
			error instanceof CoachPiUnavailableError &&
			/SAFETYSECRETARY_PI_SDK_MODULE_PATH/.test(error.message),
	);
	assert.throws(
		() => resolvePiSdkImportSpecifier("left-pad"),
		(error: unknown) =>
			error instanceof CoachPiUnavailableError &&
			/SAFETYSECRETARY_PI_SDK_MODULE_PATH/.test(error.message),
	);
});

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

async function importCoachPiRuntime() {
	return import(
		pathToFileURL("src/lib/incident/coach-pi-runtime.ts").href
	) as Promise<typeof import("../../../src/lib/incident/coach-pi-runtime")>;
}
