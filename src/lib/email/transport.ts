import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type MagicLinkEmail = {
	to: string;
	from: string;
	magicLinkUrl: string;
	expiresAt: Date;
};

export interface EmailTransport {
	sendMagicLink(email: MagicLinkEmail): Promise<void>;
}

export const DEFAULT_MAGIC_LINK_DEV_EMAIL_LOG =
	"/tmp/safety-secretary-next-magic-links.jsonl";

type EnvLike = Pick<NodeJS.ProcessEnv, string>;

export class DevFileEmailTransport implements EmailTransport {
	private readonly logPath: string;

	constructor(logPath: string = DEFAULT_MAGIC_LINK_DEV_EMAIL_LOG) {
		this.logPath = logPath;
	}

	async sendMagicLink(email: MagicLinkEmail): Promise<void> {
		const absoluteLogPath = resolve(this.logPath);
		await mkdir(dirname(absoluteLogPath), { recursive: true });

		const payload = {
			kind: "magic-link",
			to: email.to,
			from: email.from,
			subject: "Sign in to Safety Secretary",
			magicLinkUrl: email.magicLinkUrl,
			expiresAt: email.expiresAt.toISOString(),
			sentAt: new Date().toISOString(),
		};

		await appendFile(absoluteLogPath, `${JSON.stringify(payload)}\n`, {
			encoding: "utf8",
			mode: 0o600,
		});
	}
}

export class SmtpEmailTransport implements EmailTransport {
	private readonly config: {
		host?: string;
		port?: string;
		user?: string;
		password?: string;
		secure?: string;
	};

	constructor(config: {
		host?: string;
		port?: string;
		user?: string;
		password?: string;
		secure?: string;
	}) {
		this.config = config;
	}

	async sendMagicLink(): Promise<void> {
		void this.config;
		throw new Error(
			"SMTP transport is configured but not implemented in ssfw-jl7.",
		);
	}
}

type FetchLike = typeof fetch;

export class ResendEmailTransport implements EmailTransport {
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
		this.userAgent = config.userAgent ?? "SafetySecretaryNext/0.1.0";
	}

	async sendMagicLink(email: MagicLinkEmail): Promise<void> {
		const response = await this.fetchImpl(this.endpoint, {
			body: JSON.stringify({
				from: email.from,
				html: magicLinkHtml(email),
				subject: "Sign in to Safety Secretary",
				text: magicLinkText(email),
				to: email.to,
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

export function createEmailTransport(
	env: EnvLike = process.env,
): EmailTransport {
	const transport =
		env.EMAIL_TRANSPORT ?? (env.NODE_ENV === "production" ? "smtp" : "dev");

	if (transport === "resend") {
		return new ResendEmailTransport({
			apiKey: env.RESEND_API_KEY,
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
