import { type NextRequest, NextResponse } from "next/server";
import {
	type OAuthAuthorizationRequest,
	buildOAuthAuthorizationRequest,
	isOAuthProvider,
} from "../../../../../../lib/auth/oauth";
import {
	authCookieSecurityContextFromRequest,
	shouldUseSecureAuthCookies,
} from "../../../../../../lib/auth/cookies";

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

	let authorization: OAuthAuthorizationRequest;
	try {
		authorization = buildOAuthAuthorizationRequest({
			provider: providerParam,
			requestUrl: request.url,
			returnTo: request.nextUrl.searchParams.get("returnTo"),
		});
	} catch {
		return NextResponse.json(
			{ message: "OAuth provider is not configured." },
			{ status: 503 },
		);
	}

	const response = NextResponse.redirect(authorization.authorizationUrl, 303);
	response.cookies.set(authorization.cookie.name, authorization.cookie.value, {
		httpOnly: true,
		maxAge: authorization.cookie.maxAgeSeconds,
		path: "/",
		sameSite: "lax",
		secure: shouldUseSecureAuthCookies(
			authCookieSecurityContextFromRequest(request),
		),
	});

	return response;
}
