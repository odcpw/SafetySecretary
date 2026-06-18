import type { Language } from "@prisma/client";
import { prisma as defaultPrisma } from "../db";
import { hasActiveTenantMembership } from "./membership";
import {
	type OAuthProvider,
	extractOAuthSubject,
} from "./oauth";
import {
	type ResolvedWorkspace,
	resolveOrCreateWorkspaceForEmail,
} from "./workspace-resolution";

export class OAuthIdentityConflictError extends Error {
	readonly code = "OAUTH_IDENTITY_CONFLICT";

	constructor() {
		super("OAuth provider identity could not be linked to this user.");
		this.name = "OAuthIdentityConflictError";
	}
}

export async function resolveOrCreateWorkspaceForOAuthIdentity(input: {
	defaultLanguage?: Language;
	email: string;
	issuer?: string | null;
	provider: OAuthProvider;
	subject: string;
}): Promise<ResolvedWorkspace> {
	const existingIdentity = await defaultPrisma.oAuthIdentity.findUnique({
		where: {
			provider_providerSubject: {
				provider: input.provider,
				providerSubject: input.subject,
			},
		},
		select: {
			userId: true,
			user: {
				select: { email: true },
			},
		},
	});

	if (
		existingIdentity &&
		existingIdentity.user.email.toLowerCase() !== input.email.toLowerCase()
	) {
		throw new OAuthIdentityConflictError();
	}

	const workspace = await resolveOrCreateWorkspaceForEmail({
		defaultLanguage: input.defaultLanguage,
		email: input.email,
	});

	if (!(await hasActiveTenantMembership(workspace.tenantId, workspace.userId))) {
		return workspace;
	}

	if (existingIdentity && existingIdentity.userId !== workspace.userId) {
		throw new OAuthIdentityConflictError();
	}

	try {
		await defaultPrisma.oAuthIdentity.upsert({
			where: {
				provider_providerSubject: {
					provider: input.provider,
					providerSubject: input.subject,
				},
			},
			update: {
				email: input.email,
				issuer: input.issuer ?? null,
				lastSeenAt: new Date(),
			},
			create: {
				email: input.email,
				issuer: input.issuer ?? null,
				provider: input.provider,
				providerSubject: input.subject,
				userId: workspace.userId,
			},
		});
	} catch (error) {
		if (isUniqueConflict(error)) {
			throw new OAuthIdentityConflictError();
		}

		throw error;
	}

	return workspace;
}

export function oauthIdentityFromUserInfo(
	provider: OAuthProvider,
	userInfo: Record<string, unknown>,
	idTokenClaims: Record<string, unknown> | null = null,
): { issuer: string | null; subject: string } | null {
	const subject = extractOAuthSubject(provider, userInfo, idTokenClaims);
	if (!subject) {
		return null;
	}

	const claims = idTokenClaims ?? userInfo;
	const issuer = typeof claims.iss === "string" ? claims.iss : null;
	return { issuer, subject };
}

function isUniqueConflict(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "P2002"
	);
}
