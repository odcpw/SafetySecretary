import assert from "node:assert/strict";
import test from "node:test";

const transportModulePath = "../../../src/lib/email/transport.ts";
const { DevFileEmailTransport, ResendEmailTransport, createEmailTransport } =
	(await import(
		transportModulePath
	)) as typeof import("../../../src/lib/email/transport");

test("createEmailTransport returns Resend transport when configured", () => {
	const transport = createEmailTransport({
		EMAIL_TRANSPORT: "resend",
		RESEND_API_KEY: "re_test",
	});

	assert.ok(transport instanceof ResendEmailTransport);
});

test("createEmailTransport keeps dev file transport as the non-production default", () => {
	const transport = createEmailTransport({
		NODE_ENV: "development",
	});

	assert.ok(transport instanceof DevFileEmailTransport);
});

test("ResendEmailTransport sends magic links through the email API", async () => {
	const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
	const fetchImpl: typeof fetch = async (input, init) => {
		calls.push({ init, input });
		return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
	};
	const transport = new ResendEmailTransport({
		apiKey: "re_test",
		endpoint: "https://resend.example.test/emails",
		fetchImpl,
		userAgent: "SafetySecretaryNext/test",
	});

	await transport.sendMagicLink({
		expiresAt: new Date("2026-06-13T20:15:00.000Z"),
		from: "Safety Secretary <login@example.test>",
		magicLinkUrl:
			"https://app.example.test/api/auth/magic-link/verify?token=a&next=/workspace",
		to: "user@example.test",
	});

	assert.equal(calls.length, 1);
	assert.equal(calls[0]?.input, "https://resend.example.test/emails");
	assert.equal(calls[0]?.init?.method, "POST");
	assert.deepEqual(calls[0]?.init?.headers, {
		authorization: "Bearer re_test",
		"content-type": "application/json",
		"user-agent": "SafetySecretaryNext/test",
	});

	const body = JSON.parse(String(calls[0]?.init?.body)) as Record<
		string,
		unknown
	>;
	assert.equal(body.from, "Safety Secretary <login@example.test>");
	assert.equal(body.to, "user@example.test");
	assert.equal(body.subject, "Sign in to Safety Secretary");
	assert.match(String(body.text), /https:\/\/app\.example\.test\/api\/auth/);
	assert.match(String(body.html), /token=a&amp;next=\/workspace/);
});

test("ResendEmailTransport fails loudly when the API rejects a send", async () => {
	const transport = new ResendEmailTransport({
		apiKey: "re_test",
		fetchImpl: async () =>
			new Response(JSON.stringify({ message: "bad sender" }), { status: 403 }),
	});

	await assert.rejects(
		() =>
			transport.sendMagicLink({
				expiresAt: new Date("2026-06-13T20:15:00.000Z"),
				from: "Safety Secretary <login@example.test>",
				magicLinkUrl: "https://app.example.test/auth",
				to: "user@example.test",
			}),
		/Resend email send failed with status 403/,
	);
});

test("ResendEmailTransport requires an API key", () => {
	assert.throws(
		() => new ResendEmailTransport({ apiKey: "" }),
		/RESEND_API_KEY is required/,
	);
});
