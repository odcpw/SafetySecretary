import { isValidMagicLinkEmail, normalizeMagicLinkEmail } from "./magic-link";

export type WorkspaceKind = "company" | "personal";

export type EmailWorkspaceClassification =
	| {
			ok: true;
			email: string;
			domain: string;
			workspaceKind: WorkspaceKind;
	  }
	| {
			ok: false;
			email: string;
			reason: "invalid_email";
	  };

export const PUBLIC_EMAIL_DOMAINS = new Set([
	"aol.com",
	"gmail.com",
	"gmx.com",
	"gmx.net",
	"googlemail.com",
	"hotmail.com",
	"icloud.com",
	"live.com",
	"mac.com",
	"me.com",
	"msn.com",
	"outlook.com",
	"pm.me",
	"proton.me",
	"protonmail.com",
	"yahoo.com",
]);

export function classifyEmailWorkspace(
	email: string,
): EmailWorkspaceClassification {
	const normalizedEmail = normalizeMagicLinkEmail(email);

	if (!isValidMagicLinkEmail(normalizedEmail)) {
		return {
			ok: false,
			email: normalizedEmail,
			reason: "invalid_email",
		};
	}

	const domain = emailDomainFromNormalizedEmail(normalizedEmail);

	return {
		ok: true,
		email: normalizedEmail,
		domain,
		workspaceKind: isPublicEmailDomain(domain) ? "personal" : "company",
	};
}

export function emailDomainFromNormalizedEmail(email: string): string {
	const atIndex = email.lastIndexOf("@");
	return atIndex === -1 ? "" : email.slice(atIndex + 1).toLowerCase();
}

export function isPublicEmailDomain(domain: string): boolean {
	return PUBLIC_EMAIL_DOMAINS.has(domain.trim().toLowerCase());
}
