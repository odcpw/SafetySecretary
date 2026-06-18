import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
		const resolved = candidates.find((candidate) =>
			existsSync(fileURLToPath(candidate)),
		);

		if (resolved) {
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
});

const baseUrlModulePath = "../../../src/lib/auth/base-url";
const {
	AuthBaseUrlConfigurationError,
	authBaseUrlForRequest,
	hasTrustedAuthRequestOrigin,
	isTrustedAuthOrigin,
} = (await import(
	baseUrlModulePath
)) as typeof import("../../../src/lib/auth/base-url");

const originalAppBaseUrl = process.env.APP_BASE_URL;

test.afterEach(() => {
	setOptionalEnv("APP_BASE_URL", originalAppBaseUrl);
});

test("authBaseUrlForRequest requires an explicit APP_BASE_URL", () => {
	setOptionalEnv("APP_BASE_URL", undefined);

	assert.throws(
		() => authBaseUrlForRequest(),
		AuthBaseUrlConfigurationError,
	);
});

test("isTrustedAuthOrigin accepts request origin and configured public origin", () => {
	setOptionalEnv("APP_BASE_URL", "https://public.example.test");

	assert.equal(
		isTrustedAuthOrigin(
			"https://app.example.test",
			"https://app.example.test",
		),
		true,
	);
	assert.equal(
		isTrustedAuthOrigin(
			"https://public.example.test",
			"http://internal.local:3000",
		),
		true,
	);
	assert.equal(
		isTrustedAuthOrigin(
			"https://evil.example.test",
			"http://internal.local:3000",
		),
		false,
	);
});

test("hasTrustedAuthRequestOrigin falls back from Origin to Referer and fails closed", () => {
	setOptionalEnv("APP_BASE_URL", "https://public.example.test");

	assert.equal(
		hasTrustedAuthRequestOrigin(
			authRequest("http://internal.local:3000", {
				origin: "https://public.example.test",
			}),
		),
		true,
	);
	assert.equal(
		hasTrustedAuthRequestOrigin(
			authRequest("https://app.example.test", {
				referer: "https://app.example.test/invite/token",
			}),
		),
		true,
	);
	assert.equal(
		hasTrustedAuthRequestOrigin(
			authRequest("https://app.example.test", {
				referer: "not a url",
			}),
		),
		false,
	);
	assert.equal(
		hasTrustedAuthRequestOrigin(authRequest("https://app.example.test")),
		false,
	);
});

function authRequest(
	requestOrigin: string,
	headers: Record<string, string> = {},
) {
	return {
		headers: new Headers(headers),
		nextUrl: { origin: requestOrigin },
	};
}

function setOptionalEnv(key: string, value: string | undefined): void {
	if (typeof value === "undefined") {
		delete process.env[key];
		return;
	}

	process.env[key] = value;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") && !specifier.endsWith(".json");
}
