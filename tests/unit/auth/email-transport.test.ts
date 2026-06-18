import assert from "node:assert/strict";
import test from "node:test";

const transportModulePath = "../../../src/lib/email/transport.ts";
const {
	DevFileEmailTransport,
	MailgunEmailTransport,
	PostmarkEmailTransport,
	ResendEmailTransport,
	createEmailTransport,
} = (await import(
	transportModulePath
)) as typeof import("../../../src/lib/email/transport");

test("createEmailTransport returns Resend transport when configured", () => {
	const transport = createEmailTransport({
		EMAIL_TRANSPORT: "resend",
		RESEND_API_KEY: "re_test",
	});

	assert.ok(transport instanceof ResendEmailTransport);
});

test("createEmailTransport returns Postmark transport when configured", () => {
	const transport = createEmailTransport({
		EMAIL_TRANSPORT: "postmark",
		POSTMARK_SERVER_TOKEN: "pm_test",
	});

	assert.ok(transport instanceof PostmarkEmailTransport);
});

test("createEmailTransport returns Mailgun transport when configured", () => {
	const transport = createEmailTransport({
		EMAIL_TRANSPORT: "mailgun",
		MAILGUN_API_KEY: "mg_test",
		MAILGUN_DOMAIN: "mg.example.test",
	});

	assert.ok(transport instanceof MailgunEmailTransport);
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

test("ResendEmailTransport sends invitation emails through the email API", async () => {
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

	await transport.sendInvitation({
		expiresAt: new Date("2026-06-20T20:15:00.000Z"),
		from: "Safety Secretary <invite@example.test>",
		inviteUrl: "https://app.example.test/invite/token-a",
		tenantName: "Alpha Safety AG",
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
	assert.equal(body.from, "Safety Secretary <invite@example.test>");
	assert.equal(body.to, "user@example.test");
	assert.equal(body.subject, "Invitation to Alpha Safety AG on Safety Secretary");
	assert.match(String(body.text), /https:\/\/app\.example\.test\/invite\/token-a/);
	assert.match(String(body.html), /Accept invitation/);
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

test("PostmarkEmailTransport sends magic links through the email API without tracking", async () => {
	const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
	const fetchImpl: typeof fetch = async (input, init) => {
		calls.push({ init, input });
		return new Response(
			JSON.stringify({ MessageID: "email-1", ErrorCode: 0 }),
			{ status: 200 },
		);
	};
	const transport = new PostmarkEmailTransport({
		endpoint: "https://postmark.example.test/email",
		fetchImpl,
		messageStream: "outbound",
		serverToken: "pm_test",
		userAgent: "SafetySecretaryNext/test",
	});

	await transport.sendMagicLink({
		expiresAt: new Date("2026-06-13T20:15:00.000Z"),
		from: "SafetySecretary <login@example.test>",
		magicLinkUrl:
			"https://app.example.test/api/auth/magic-link/verify?token=a&next=/workspace",
		to: "user@example.test",
	});

	assert.equal(calls.length, 1);
	assert.equal(calls[0]?.input, "https://postmark.example.test/email");
	assert.equal(calls[0]?.init?.method, "POST");
	assert.deepEqual(calls[0]?.init?.headers, {
		accept: "application/json",
		"content-type": "application/json",
		"user-agent": "SafetySecretaryNext/test",
		"x-postmark-server-token": "pm_test",
	});

	const body = JSON.parse(String(calls[0]?.init?.body)) as Record<
		string,
		unknown
	>;
	assert.equal(body.From, "SafetySecretary <login@example.test>");
	assert.equal(body.To, "user@example.test");
	assert.equal(body.Subject, "Sign in to Safety Secretary");
	assert.equal(body.MessageStream, "outbound");
	assert.equal(body.TrackLinks, "None");
	assert.equal(body.TrackOpens, false);
	assert.match(String(body.TextBody), /https:\/\/app\.example\.test\/api\/auth/);
	assert.match(String(body.HtmlBody), /token=a&amp;next=\/workspace/);
});

test("PostmarkEmailTransport fails loudly when the API rejects a send", async () => {
	const transport = new PostmarkEmailTransport({
		serverToken: "pm_test",
		fetchImpl: async () =>
			new Response(JSON.stringify({ Message: "bad sender" }), { status: 422 }),
	});

	await assert.rejects(
		() =>
			transport.sendMagicLink({
				expiresAt: new Date("2026-06-13T20:15:00.000Z"),
				from: "SafetySecretary <login@example.test>",
				magicLinkUrl: "https://app.example.test/auth",
				to: "user@example.test",
			}),
		/Postmark email send failed with status 422/,
	);
});

test("PostmarkEmailTransport requires a server token", () => {
	assert.throws(
		() => new PostmarkEmailTransport({ serverToken: "" }),
		/POSTMARK_SERVER_TOKEN is required/,
	);
});

test("MailgunEmailTransport sends magic links through the messages API without tracking", async () => {
	const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
	const fetchImpl: typeof fetch = async (input, init) => {
		calls.push({ init, input });
		return new Response(JSON.stringify({ id: "email-1", message: "Queued" }), {
			status: 200,
		});
	};
	const transport = new MailgunEmailTransport({
		apiKey: "mg_test",
		baseUrl: "https://api.eu.mailgun.example.test/",
		domain: "mg.example.test",
		fetchImpl,
		userAgent: "SafetySecretaryNext/test",
	});

	await transport.sendMagicLink({
		expiresAt: new Date("2026-06-13T20:15:00.000Z"),
		from: "SafetySecretary <login@example.test>",
		magicLinkUrl:
			"https://app.example.test/api/auth/magic-link/verify?token=a&next=/workspace",
		to: "user@example.test",
	});

	assert.equal(calls.length, 1);
	assert.equal(
		calls[0]?.input,
		"https://api.eu.mailgun.example.test/v3/mg.example.test/messages",
	);
	assert.equal(calls[0]?.init?.method, "POST");
	assert.deepEqual(calls[0]?.init?.headers, {
		authorization: `Basic ${Buffer.from("api:mg_test").toString("base64")}`,
		"content-type": "application/x-www-form-urlencoded",
		"user-agent": "SafetySecretaryNext/test",
	});

	assert.ok(calls[0]?.init?.body instanceof URLSearchParams);
	const body = calls[0]?.init?.body as URLSearchParams;
	assert.equal(body.get("from"), "SafetySecretary <login@example.test>");
	assert.equal(body.get("to"), "user@example.test");
	assert.equal(body.get("subject"), "Sign in to Safety Secretary");
	assert.equal(body.get("o:tracking"), "no");
	assert.equal(body.get("o:tracking-clicks"), "no");
	assert.equal(body.get("o:tracking-opens"), "no");
	assert.match(String(body.get("text")), /https:\/\/app\.example\.test\/api\/auth/);
	assert.match(String(body.get("html")), /token=a&amp;next=\/workspace/);
});

test("MailgunEmailTransport fails loudly when the API rejects a send", async () => {
	const transport = new MailgunEmailTransport({
		apiKey: "mg_test",
		domain: "mg.example.test",
		fetchImpl: async () =>
			new Response(JSON.stringify({ message: "domain not verified" }), {
				status: 403,
			}),
	});

	await assert.rejects(
		() =>
			transport.sendMagicLink({
				expiresAt: new Date("2026-06-13T20:15:00.000Z"),
				from: "SafetySecretary <login@example.test>",
				magicLinkUrl: "https://app.example.test/auth",
				to: "user@example.test",
			}),
		/Mailgun email send failed with status 403/,
	);
});

test("MailgunEmailTransport requires an API key and domain", () => {
	assert.throws(
		() =>
			new MailgunEmailTransport({
				apiKey: "",
				domain: "mg.example.test",
			}),
		/MAILGUN_API_KEY is required/,
	);

	assert.throws(
		() =>
			new MailgunEmailTransport({
				apiKey: "mg_test",
				domain: "",
			}),
		/MAILGUN_DOMAIN is required/,
	);
});
