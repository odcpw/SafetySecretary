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

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

const emailDomainModulePath = "../../../src/lib/auth/email-domain.ts";
const {
	classifyEmailWorkspace,
	emailDomainFromNormalizedEmail,
	isPublicEmailDomain,
} = (await import(
	emailDomainModulePath
)) as typeof import("../../../src/lib/auth/email-domain");

test("classifies public email domains as personal workspaces", () => {
	assert.deepEqual(classifyEmailWorkspace("Alice+beta@GMAIL.COM"), {
		ok: true,
		email: "alice+beta@gmail.com",
		domain: "gmail.com",
		workspaceKind: "personal",
	});

	assert.equal(isPublicEmailDomain("googlemail.com"), true);
	assert.equal(isPublicEmailDomain(" Proton.Me "), true);
});

test("classifies company domains as shared company workspaces", () => {
	assert.deepEqual(classifyEmailWorkspace("Safety.Manager@Acme.COM"), {
		ok: true,
		email: "safety.manager@acme.com",
		domain: "acme.com",
		workspaceKind: "company",
	});

	assert.deepEqual(classifyEmailWorkspace("bob@company.ch"), {
		ok: true,
		email: "bob@company.ch",
		domain: "company.ch",
		workspaceKind: "company",
	});
});

test("keeps same public domain users personal rather than domain-shared", () => {
	const alice = classifyEmailWorkspace("alice@gmail.com");
	const bob = classifyEmailWorkspace("bob@gmail.com");

	assert.equal(alice.ok && alice.workspaceKind, "personal");
	assert.equal(bob.ok && bob.workspaceKind, "personal");
	assert.equal(alice.ok && alice.domain, "gmail.com");
	assert.equal(bob.ok && bob.domain, "gmail.com");
});

test("rejects invalid emails without deriving a workspace", () => {
	assert.deepEqual(classifyEmailWorkspace("not-an-email"), {
		ok: false,
		email: "not-an-email",
		reason: "invalid_email",
	});
	assert.deepEqual(classifyEmailWorkspace("missing-domain@"), {
		ok: false,
		email: "missing-domain@",
		reason: "invalid_email",
	});
});

test("extracts domains from already-normalized emails", () => {
	assert.equal(emailDomainFromNormalizedEmail("one@acme.com"), "acme.com");
	assert.equal(emailDomainFromNormalizedEmail("invalid"), "");
});
