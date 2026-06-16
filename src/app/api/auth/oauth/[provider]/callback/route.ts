import { type NextRequest, NextResponse } from "next/server";
import {
	decodeOAuthStateCookie,
	exchangeOAuthCode,
	extractVerifiedOAuthEmail,
	fetchOAuthUserInfo,
	isOAuthProvider,
	oauthStateCookieName,
} from "../../../../../../lib/auth/oauth";
import {
	OAuthIdentityConflictError,
	oauthIdentityFromUserInfo,
	resolveOrCreateWorkspaceForOAuthIdentity,
} from "../../../../../../lib/auth/oauth-identity";
import { signInVerifiedEmail } from "../../../../../../lib/auth/verified-email-signin";

export const runtime = "nodejs";

type OAuthRouteContext = {
	params: Promise<{ provider: string }> | { provider: string };
};

export async function GET(
	request: NextRequest,
	context: OAuthRouteContext,
): Promise<NextResponse> {
	const providerParam = (await context.params).provider;
	if (!isOAuthProvider(providerParam)) {
		return NextResponse.json(
			{ message: "Unsupported OAuth provider." },
			{ status: 404 },
		);
	}

	const cookieName = oauthStateCookieName(providerParam);
	const stateCookie = decodeOAuthStateCookie(
		request.cookies.get(cookieName)?.value ?? "",
	);

	if (
		!stateCookie ||
		stateCookie.provider !== providerParam ||
		stateCookie.state !== request.nextUrl.searchParams.get("state")
	) {
		return clearOAuthStateCookie(
			redirectToSignin(request, "oauth_state"),
			cookieName,
		);
	}

	const code = request.nextUrl.searchParams.get("code");
	const providerError = request.nextUrl.searchParams.get("error");
	if (providerError || !code) {
		return clearOAuthStateCookie(
			redirectToSignin(request, "oauth_failed"),
			cookieName,
		);
	}

	try {
		const token = await exchangeOAuthCode({
			code,
			codeVerifier: stateCookie.codeVerifier,
			provider: providerParam,
			requestUrl: request.url,
		});
		const userInfo = await fetchOAuthUserInfo({
			accessToken: token.accessToken,
			provider: providerParam,
		});
		const email = extractVerifiedOAuthEmail(
			providerParam,
			userInfo,
			token.idTokenClaims,
		);
		const identity = oauthIdentityFromUserInfo(
			providerParam,
			userInfo,
			token.idTokenClaims,
		);

		if (!email || !identity) {
			return clearOAuthStateCookie(
				redirectToSignin(request, "oauth_email"),
				cookieName,
			);
		}

		const result = await signInVerifiedEmail({
			email,
			request,
			returnTo: stateCookie.returnTo,
			workspaceResolver: ({ defaultLanguage }) =>
				resolveOrCreateWorkspaceForOAuthIdentity({
					defaultLanguage,
					email,
					issuer: identity.issuer,
					provider: providerParam,
					subject: identity.subject,
				}),
		});

		if (!result.ok) {
			return clearOAuthStateCookie(
				redirectToSignin(request, "oauth_failed"),
				cookieName,
			);
		}

		return clearOAuthStateCookie(result.response, cookieName);
	} catch (error) {
		if (error instanceof OAuthIdentityConflictError) {
			logOAuthFailure(providerParam, error.code);
			return clearOAuthStateCookie(
				redirectToSignin(request, "oauth_identity_conflict"),
				cookieName,
			);
		}

		logOAuthFailure(providerParam, errorReason(error));
		return clearOAuthStateCookie(
			redirectToSignin(request, "oauth_failed"),
			cookieName,
		);
	}
}

function redirectToSignin(request: NextRequest, reason: string): NextResponse {
	const url = new URL("/signin", request.url);
	url.searchParams.set("oauth", reason);
	return NextResponse.redirect(url, 303);
}

function clearOAuthStateCookie(
	response: NextResponse,
	cookieName: string,
): NextResponse {
	response.cookies.set(cookieName, "", {
		httpOnly: true,
		maxAge: 0,
		path: "/",
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
	});
	return response;
}

function logOAuthFailure(provider: string, reason: string): void {
	console.warn("OAuth sign-in failed.", { provider, reason });
}

function errorReason(error: unknown): string {
	if (typeof error === "object" && error !== null && "code" in error) {
		const code = (error as { code?: unknown }).code;
		if (typeof code === "string" && code) {
			return code;
		}
	}

	return error instanceof Error ? error.name : "unknown";
}
