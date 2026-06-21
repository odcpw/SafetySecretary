import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type MagicLinkEmail = {
	to: string;
	from: string;
	magicLinkUrl: string;
	expiresAt: Date;
};

export type InvitationEmail = {
	to: string;
	from: string;
	inviteUrl: string;
	tenantName: string;
	expiresAt: Date;
};

export type TransactionalEmailAttachment = {
	filename: string;
	contentType: string;
	content: Uint8Array | Buffer | string;
};

export type TransactionalEmailMessage = {
	to: string;
	from: string;
	subject: string;
	text: string;
	html: string;
	attachments?: TransactionalEmailAttachment[];
};

export interface EmailTransport {
	sendMagicLink(email: MagicLinkEmail): Promise<void>;
}

export interface TransactionalEmailTransport extends EmailTransport {
	sendInvitation(email: InvitationEmail): Promise<void>;
	sendTransactional(email: TransactionalEmailMessage): Promise<void>;
}

export const DEFAULT_MAGIC_LINK_DEV_EMAIL_LOG =
	"/tmp/safetysecretary-magic-links.jsonl";

type EnvLike = Pick<NodeJS.ProcessEnv, string>;

export class DevFileEmailTransport implements TransactionalEmailTransport {
	private readonly logPath: string;

	constructor(logPath: string = DEFAULT_MAGIC_LINK_DEV_EMAIL_LOG) {
		this.logPath = logPath;
	}

	async sendMagicLink(email: MagicLinkEmail): Promise<void> {
		await appendEmailPayload(this.logPath, {
			kind: "magic-link",
			to: email.to,
			from: email.from,
			subject: "Sign in to Safety Secretary",
			magicLinkUrl: email.magicLinkUrl,
			expiresAt: email.expiresAt.toISOString(),
			sentAt: new Date().toISOString(),
		});
	}

	async sendInvitation(email: InvitationEmail): Promise<void> {
		await appendEmailPayload(this.logPath, {
			kind: "invitation",
			to: email.to,
			from: email.from,
			subject: invitationSubject(email),
			inviteUrl: email.inviteUrl,
			tenantName: email.tenantName,
			expiresAt: email.expiresAt.toISOString(),
			sentAt: new Date().toISOString(),
		});
	}

	async sendTransactional(email: TransactionalEmailMessage): Promise<void> {
		await appendEmailPayload(this.logPath, {
			kind: "transactional",
			to: email.to,
			from: email.from,
			subject: email.subject,
			text: email.text,
			html: email.html,
			attachments: (email.attachments ?? []).map((attachment) => ({
				filename: attachment.filename,
				contentType: attachment.contentType,
				byteLength: attachmentByteLength(attachment),
			})),
			sentAt: new Date().toISOString(),
		});
	}
}

async function appendEmailPayload(
	logPath: string,
	payload: Record<string, unknown>,
): Promise<void> {
	const absoluteLogPath = resolve(logPath);
	await mkdir(dirname(absoluteLogPath), { recursive: true });

	await appendFile(absoluteLogPath, `${JSON.stringify(payload)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
}

export const EMAIL_TRANSPORT_NOT_CONFIGURED_MESSAGE =
	"Email transport not configured: set EMAIL_TRANSPORT to a supported provider (resend, postmark, or mailgun) and its credentials (e.g. RESEND_API_KEY).";

export class SmtpEmailTransport implements TransactionalEmailTransport {
	constructor(_config: {
		host?: string;
		port?: string;
		user?: string;
		password?: string;
		secure?: string;
	}) {
		throw new Error(EMAIL_TRANSPORT_NOT_CONFIGURED_MESSAGE);
	}

	async sendMagicLink(): Promise<void> {
		throw new Error(EMAIL_TRANSPORT_NOT_CONFIGURED_MESSAGE);
	}

	async sendInvitation(): Promise<void> {
		throw new Error(EMAIL_TRANSPORT_NOT_CONFIGURED_MESSAGE);
	}

	async sendTransactional(): Promise<void> {
		throw new Error(EMAIL_TRANSPORT_NOT_CONFIGURED_MESSAGE);
	}
}

type FetchLike = typeof fetch;
type TransactionalEmailContent = {
	attachments?: TransactionalEmailAttachment[];
	html: string;
	subject: string;
	text: string;
};

export class ResendEmailTransport implements TransactionalEmailTransport {
	private readonly apiKey: string;
	private readonly endpoint: string;
	private readonly fetchImpl: FetchLike;
	private readonly userAgent: string;

	constructor(config: {
		apiKey?: string;
		endpoint?: string;
		fetchImpl?: FetchLike;
		userAgent?: string;
	}) {
		const apiKey = config.apiKey?.trim();

		if (!apiKey) {
			throw new Error(
				"RESEND_API_KEY is required when EMAIL_TRANSPORT=resend.",
			);
		}

		this.apiKey = apiKey;
		this.endpoint = config.endpoint ?? "https://api.resend.com/emails";
		this.fetchImpl = config.fetchImpl ?? fetch;
		this.userAgent = config.userAgent ?? "SafetySecretary/0.1.0";
	}

	async sendMagicLink(email: MagicLinkEmail): Promise<void> {
		await this.send(email.to, email.from, magicLinkContent(email));
	}

	async sendInvitation(email: InvitationEmail): Promise<void> {
		await this.send(email.to, email.from, invitationContent(email));
	}

	async sendTransactional(email: TransactionalEmailMessage): Promise<void> {
		await this.send(email.to, email.from, {
			attachments: email.attachments,
			html: email.html,
			subject: email.subject,
			text: email.text,
		});
	}

	private async send(
		to: string,
		from: string,
		content: TransactionalEmailContent,
	): Promise<void> {
		const attachments = serializeResendAttachments(content.attachments);
		const response = await this.fetchImpl(this.endpoint, {
			body: JSON.stringify({
				...(attachments.length > 0 ? { attachments } : {}),
				from,
				html: content.html,
				subject: content.subject,
				text: content.text,
				to,
			}),
			headers: {
				authorization: `Bearer ${this.apiKey}`,
				"content-type": "application/json",
				"user-agent": this.userAgent,
			},
			method: "POST",
		});

		if (!response.ok) {
			throw new Error(
				`Resend email send failed with status ${response.status}.`,
			);
		}
	}
}

export class PostmarkEmailTransport implements TransactionalEmailTransport {
	private readonly endpoint: string;
	private readonly fetchImpl: FetchLike;
	private readonly messageStream?: string;
	private readonly serverToken: string;
	private readonly userAgent: string;

	constructor(config: {
		endpoint?: string;
		fetchImpl?: FetchLike;
		messageStream?: string;
		serverToken?: string;
		userAgent?: string;
	}) {
		const serverToken = config.serverToken?.trim();

		if (!serverToken) {
			throw new Error(
				"POSTMARK_SERVER_TOKEN is required when EMAIL_TRANSPORT=postmark.",
			);
		}

		this.endpoint = config.endpoint ?? "https://api.postmarkapp.com/email";
		this.fetchImpl = config.fetchImpl ?? fetch;
		this.messageStream = config.messageStream?.trim() || undefined;
		this.serverToken = serverToken;
		this.userAgent = config.userAgent ?? "SafetySecretary/0.1.0";
	}

	async sendMagicLink(email: MagicLinkEmail): Promise<void> {
		await this.send(email.to, email.from, magicLinkContent(email));
	}

	async sendInvitation(email: InvitationEmail): Promise<void> {
		await this.send(email.to, email.from, invitationContent(email));
	}

	async sendTransactional(email: TransactionalEmailMessage): Promise<void> {
		await this.send(email.to, email.from, {
			attachments: email.attachments,
			html: email.html,
			subject: email.subject,
			text: email.text,
		});
	}

	private async send(
		to: string,
		from: string,
		content: TransactionalEmailContent,
	): Promise<void> {
		const attachments = serializePostmarkAttachments(content.attachments);
		const response = await this.fetchImpl(this.endpoint, {
			body: JSON.stringify({
				...(attachments.length > 0 ? { Attachments: attachments } : {}),
				From: from,
				HtmlBody: content.html,
				MessageStream: this.messageStream,
				Subject: content.subject,
				TextBody: content.text,
				To: to,
				TrackLinks: "None",
				TrackOpens: false,
			}),
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				"user-agent": this.userAgent,
				"x-postmark-server-token": this.serverToken,
			},
			method: "POST",
		});

		if (!response.ok) {
			throw new Error(
				`Postmark email send failed with status ${response.status}.`,
			);
		}
	}
}

export class MailgunEmailTransport implements TransactionalEmailTransport {
	private readonly apiKey: string;
	private readonly baseUrl: string;
	private readonly domain: string;
	private readonly fetchImpl: FetchLike;
	private readonly userAgent: string;

	constructor(config: {
		apiKey?: string;
		baseUrl?: string;
		domain?: string;
		fetchImpl?: FetchLike;
		userAgent?: string;
	}) {
		const apiKey = config.apiKey?.trim();
		const domain = config.domain?.trim();

		if (!apiKey) {
			throw new Error(
				"MAILGUN_API_KEY is required when EMAIL_TRANSPORT=mailgun.",
			);
		}

		if (!domain) {
			throw new Error(
				"MAILGUN_DOMAIN is required when EMAIL_TRANSPORT=mailgun.",
			);
		}

		this.apiKey = apiKey;
		this.baseUrl = (config.baseUrl ?? "https://api.mailgun.net").replace(
			/\/+$/,
			"",
		);
		this.domain = domain;
		this.fetchImpl = config.fetchImpl ?? fetch;
		this.userAgent = config.userAgent ?? "SafetySecretary/0.1.0";
	}

	async sendMagicLink(email: MagicLinkEmail): Promise<void> {
		await this.send(email.to, email.from, magicLinkContent(email));
	}

	async sendInvitation(email: InvitationEmail): Promise<void> {
		await this.send(email.to, email.from, invitationContent(email));
	}

	async sendTransactional(email: TransactionalEmailMessage): Promise<void> {
		await this.send(email.to, email.from, {
			attachments: email.attachments,
			html: email.html,
			subject: email.subject,
			text: email.text,
		});
	}

	private async send(
		to: string,
		from: string,
		content: TransactionalEmailContent,
	): Promise<void> {
		const attachments = content.attachments ?? [];
		const body =
			attachments.length > 0
				? mailgunMultipartBody(to, from, content)
				: new URLSearchParams(mailgunFields(to, from, content));
		const headers: Record<string, string> = {
			authorization: `Basic ${Buffer.from(`api:${this.apiKey}`).toString(
				"base64",
			)}`,
			"user-agent": this.userAgent,
		};

		if (body instanceof URLSearchParams) {
			headers["content-type"] = "application/x-www-form-urlencoded";
		}

		const response = await this.fetchImpl(
			`${this.baseUrl}/v3/${encodeURIComponent(this.domain)}/messages`,
			{
				body,
				headers,
				method: "POST",
			},
		);

		if (!response.ok) {
			throw new Error(
				`Mailgun email send failed with status ${response.status}.`,
			);
		}
	}
}

function magicLinkContent(email: MagicLinkEmail): TransactionalEmailContent {
	return {
		html: magicLinkHtml(email),
		subject: "Sign in to Safety Secretary",
		text: magicLinkText(email),
	};
}

function invitationContent(email: InvitationEmail): TransactionalEmailContent {
	return {
		html: invitationHtml(email),
		subject: invitationSubject(email),
		text: invitationText(email),
	};
}

function serializeResendAttachments(
	attachments: TransactionalEmailAttachment[] | undefined,
): Array<{ filename: string; content: string }> {
	return (attachments ?? []).map((attachment) => ({
		filename: attachment.filename,
		content: attachmentBytes(attachment.content).toString("base64"),
	}));
}

function serializePostmarkAttachments(
	attachments: TransactionalEmailAttachment[] | undefined,
): Array<{ Name: string; Content: string; ContentType: string }> {
	return (attachments ?? []).map((attachment) => ({
		Name: attachment.filename,
		Content: attachmentBytes(attachment.content).toString("base64"),
		ContentType: attachment.contentType,
	}));
}

function mailgunFields(
	to: string,
	from: string,
	content: TransactionalEmailContent,
): Record<string, string> {
	return {
		from,
		html: content.html,
		"o:tracking": "no",
		"o:tracking-clicks": "no",
		"o:tracking-opens": "no",
		subject: content.subject,
		text: content.text,
		to,
	};
}

function mailgunMultipartBody(
	to: string,
	from: string,
	content: TransactionalEmailContent,
): FormData {
	const body = new FormData();

	for (const [key, value] of Object.entries(mailgunFields(to, from, content))) {
		body.append(key, value);
	}

	for (const attachment of content.attachments ?? []) {
		body.append(
			"attachment",
			new Blob([arrayBuffer(attachmentBytes(attachment.content))], {
				type: attachment.contentType,
			}),
			attachment.filename,
		);
	}

	return body;
}

function attachmentByteLength(
	attachment: TransactionalEmailAttachment,
): number {
	return attachmentBytes(attachment.content).byteLength;
}

function attachmentBytes(content: Uint8Array | Buffer | string): Buffer {
	if (typeof content === "string") {
		return Buffer.from(content, "utf8");
	}

	return Buffer.from(content);
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
}

export function createEmailTransport(
	env: EnvLike = process.env,
): TransactionalEmailTransport {
	const transport = env.EMAIL_TRANSPORT?.trim();

	if (!transport) {
		// Fail loudly in production: an unconfigured transport must not silently
		// drop sign-in/invite emails while the UI reports success.
		if (env.NODE_ENV === "production") {
			throw new Error(EMAIL_TRANSPORT_NOT_CONFIGURED_MESSAGE);
		}

		return new DevFileEmailTransport(
			env.MAGIC_LINK_DEV_EMAIL_LOG ?? DEFAULT_MAGIC_LINK_DEV_EMAIL_LOG,
		);
	}

	if (transport === "resend") {
		return new ResendEmailTransport({
			apiKey: env.RESEND_API_KEY,
		});
	}

	if (transport === "postmark") {
		return new PostmarkEmailTransport({
			messageStream: env.POSTMARK_MESSAGE_STREAM,
			serverToken: env.POSTMARK_SERVER_TOKEN,
		});
	}

	if (transport === "mailgun") {
		return new MailgunEmailTransport({
			apiKey: env.MAILGUN_API_KEY,
			baseUrl: env.MAILGUN_BASE_URL,
			domain: env.MAILGUN_DOMAIN,
		});
	}

	if (transport === "smtp") {
		return new SmtpEmailTransport({
			host: env.SMTP_HOST,
			port: env.SMTP_PORT,
			user: env.SMTP_USER,
			password: env.SMTP_PASSWORD,
			secure: env.SMTP_SECURE,
		});
	}

	// An unrecognized/misspelled transport must not silently fall back to the
	// dev file log in production while the UI reports success.
	if (env.NODE_ENV === "production") {
		throw new Error(
			`Unsupported EMAIL_TRANSPORT="${transport}". Set EMAIL_TRANSPORT to one of: resend, postmark, mailgun, smtp.`,
		);
	}

	return new DevFileEmailTransport(
		env.MAGIC_LINK_DEV_EMAIL_LOG ?? DEFAULT_MAGIC_LINK_DEV_EMAIL_LOG,
	);
}

function magicLinkText(email: MagicLinkEmail): string {
	return [
		"Sign in to Safety Secretary",
		"",
		"Use this link to sign in:",
		email.magicLinkUrl,
		"",
		`This link expires at ${email.expiresAt.toISOString()}.`,
		"If you did not request this link, you can ignore this email.",
	].join("\n");
}

function magicLinkHtml(email: MagicLinkEmail): string {
	const url = escapeHtml(email.magicLinkUrl);
	const expiresAt = escapeHtml(email.expiresAt.toISOString());

	return [
		"<p>Use this link to sign in to Safety Secretary:</p>",
		`<p><a href="${url}">Sign in to Safety Secretary</a></p>`,
		`<p>This link expires at ${expiresAt}.</p>`,
		"<p>If you did not request this link, you can ignore this email.</p>",
	].join("");
}

function invitationSubject(email: InvitationEmail): string {
	return `Invitation to ${email.tenantName} on Safety Secretary`;
}

function invitationText(email: InvitationEmail): string {
	return [
		invitationSubject(email),
		"",
		"Use this link to join the workspace:",
		email.inviteUrl,
		"",
		`This invitation expires at ${email.expiresAt.toISOString()}.`,
		"If you did not expect this invitation, you can ignore this email.",
	].join("\n");
}

function invitationHtml(email: InvitationEmail): string {
	const inviteUrl = escapeHtml(email.inviteUrl);
	const tenantName = escapeHtml(email.tenantName);
	const expiresAt = escapeHtml(email.expiresAt.toISOString());

	return [
		`<p>You have been invited to ${tenantName} on Safety Secretary.</p>`,
		`<p><a href="${inviteUrl}">Accept invitation</a></p>`,
		`<p>This invitation expires at ${expiresAt}.</p>`,
		"<p>If you did not expect this invitation, you can ignore this email.</p>",
	].join("");
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => {
		switch (character) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			default:
				return "&#39;";
		}
	});
}
