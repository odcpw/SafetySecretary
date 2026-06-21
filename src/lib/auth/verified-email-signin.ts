import type { Language } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "../db";
import { appRedirectOrigin } from "./base-url";
import {
	authCookieSecurityContextFromRequest,
	setSessionCookie,
} from "./cookies";
import { setCsrfCookie } from "./csrf";
import { pickInitialUiLocale } from "./locale";
import { hasActiveTenantMembership } from "./membership";
import { normalizeLocalReturnTo } from "./return-to";
import { issueSession, SessionTenantMembershipError } from "./session";
import {
	type ResolvedWorkspace,
	resolveOrCreateWorkspaceForEmail,
} from "./workspace-resolution";
import {
	notifyOperatorTenantAccess,
	scheduleOperatorNotification,
} from "../operator/notifications";

export const INVITATION_REQUIRED_MESSAGE =
	"This workspace requires an invitation before you can sign in.";
export const INVITATION_REQUIRED_CODE = "INVITATION_REQUIRED";

export type VerifiedEmailSignInFailureCode =
	| typeof INVITATION_REQUIRED_CODE
	| "SESSION_MEMBERSHIP_REQUIRED";

export type VerifiedEmailSignInResult =
	| {
			ok: true;
			response: NextResponse;
			tenantId: string;
			userId: string;
	  }
	| {
			code: VerifiedEmailSignInFailureCode;
			ok: false;
			response: NextResponse;
	  };

type WorkspaceResolver = (input: {
	defaultLanguage: Language;
	email: string;
}) => Promise<ResolvedWorkspace>;

export async function signInVerifiedEmail(input: {
	email: string;
	request: NextRequest;
	returnTo?: string;
	workspaceResolver?: WorkspaceResolver;
}): Promise<VerifiedEmailSignInResult> {
	const defaultLanguage = pickInitialUiLocale(
		input.request.headers.get("accept-language"),
		"en",
	) as Language;
	const workspaceResolver =
		input.workspaceResolver ?? resolveOrCreateWorkspaceForEmail;
	const workspace = await workspaceResolver({
		defaultLanguage,
		email: input.email,
	});

	if (
		!(await hasActiveTenantMembership(workspace.tenantId, workspace.userId))
	) {
		return {
			code: INVITATION_REQUIRED_CODE,
			ok: false,
			response: NextResponse.json(
				{
					code: INVITATION_REQUIRED_CODE,
					message: INVITATION_REQUIRED_MESSAGE,
				},
				{ status: 403 },
			),
		};
	}

	let session: Awaited<ReturnType<typeof issueSession>>;

	try {
		session = await issueSession(
			workspace.userId,
			workspace.tenantId,
			input.request.headers.get("user-agent"),
		);
	} catch (error) {
		if (error instanceof SessionTenantMembershipError) {
			return {
				code: "SESSION_MEMBERSHIP_REQUIRED",
				ok: false,
				response: NextResponse.json(
					{ message: "Sign-in could not be completed." },
					{ status: 400 },
				),
			};
		}

		throw error;
	}

	await captureUiLocaleOnFirstSignIn(
		workspace.userId,
		workspace.tenantId,
		input.request.headers.get("accept-language"),
	);

	const redirectTo = normalizeLocalReturnTo(input.returnTo);
	const response = NextResponse.redirect(
		// Public origin (APP_BASE_URL), not request.url which is localhost:3000
		// behind the reverse proxy.
		new URL(redirectTo, appRedirectOrigin(input.request.nextUrl.origin)),
		303,
	);
	const cookieSecurity = authCookieSecurityContextFromRequest(input.request);
	setSessionCookie(response, session, cookieSecurity);
	setCsrfCookie(response, session.cookieValue, cookieSecurity);
	queueTenantAccessNotification(workspace);

	return {
		ok: true,
		response,
		tenantId: workspace.tenantId,
		userId: workspace.userId,
	};
}

function queueTenantAccessNotification(workspace: ResolvedWorkspace): void {
	if (!workspace.createdTenant && !workspace.joinedTenant) {
		return;
	}

	scheduleOperatorNotification("tenant access", () =>
		notifyOperatorTenantAccess({
			action: workspace.createdTenant ? "created" : "joined",
			tenantId: workspace.tenantId,
			userId: workspace.userId,
			userEmail: workspace.email,
			workspaceKind: workspace.workspaceKind,
		}),
	);
}

async function captureUiLocaleOnFirstSignIn(
	userId: string,
	tenantId: string,
	acceptLanguageHeader: string | null,
): Promise<void> {
	const tenant = await prisma.tenant.findUniqueOrThrow({
		where: { id: tenantId },
		select: { defaultLanguage: true },
	});

	await prisma.user.updateMany({
		where: {
			id: userId,
			uiLocale: null,
		},
		data: {
			uiLocale: pickInitialUiLocale(
				acceptLanguageHeader,
				tenant.defaultLanguage,
			) as Language,
		},
	});
}
