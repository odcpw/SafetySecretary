import { createHash, randomBytes } from "node:crypto";
import {
	isValidMagicLinkEmail,
	normalizeMagicLinkEmail,
} from "./magic-link";

export type OAuthProvider = "google" | "microsoft";

export type OAuthProviderConfig = {
	authorizationEndpoint: string;
	clientId: string;
	clientSecret: string;
	provider: OAuthProvider;
	scopes: string[];
	tokenEndpoint: string;
	userInfoEndpoint: string;
};

export type OAuthAuthorizationRequest = {
	authorizationUrl: URL;
	cookie: {
		name: string;
		value: string;
		maxAgeSeconds: number;
	};
};

export type OAuthStateCookie = {
	codeVerifier: string;
	provider: OAuthProvider;
	returnTo: string;
	state: string;
};

type EnvLike = Pick<NodeJS.ProcessEnv, string>;

type OAuthUserInfo = Record<string, unknown>;
type OAuthTokenClaims = Record<string, unknown>;

export const OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const OAUTH_STATE_COOKIE_PREFIX = "ssfw_oauth_";

const providerNames = new Set<OAuthProvider>(["google", "microsoft"]);

export function isOAuthProvider(value: string): value is OAuthProvider {
	return providerNames.has(value as OAuthProvider);
}

export function oauthStateCookieName(provider: OAuthProvider): string {
	return `${OAUTH_STATE_COOKIE_PREFIX}${provider}`;
}

export function oauthProviderConfig(
	provider: OAuthProvider,
	env: EnvLike = process.env,
): OAuthProviderConfig {
	if (provider === "microsoft") {
		const tenant = (
			env.MICROSOFT_OAUTH_TENANT ??
			env.AZURE_AD_TENANT_ID ??
			"common"
		).trim();
		return {
			authorizationEndpoint: `https://login.microsoftonline.com/${encodeURIComponent(
				tenant,
			)}/oauth2/v2.0/authorize`,
			clientId:
				env.MICROSOFT_OAUTH_CLIENT_ID ?? env.AZURE_AD_CLIENT_ID ?? "",
			clientSecret:
				env.MICROSOFT_OAUTH_CLIENT_SECRET ??
				env.AZURE_AD_CLIENT_SECRET ??
				"",
			provider,
			scopes: ["openid", "email", "profile"],
			tokenEndpoint: `https://login.microsoftonline.com/${encodeURIComponent(
				tenant,
			)}/oauth2/v2.0/token`,
			userInfoEndpoint: "https://graph.microsoft.com/oidc/userinfo",
		};
	}

	return {
		authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
		clientId: env.GOOGLE_OAUTH_CLIENT_ID ?? env.GOOGLE_CLIENT_ID ?? "",
		clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? env.GOOGLE_CLIENT_SECRET ?? "",
		provider,
		scopes: ["openid", "email", "profile"],
		tokenEndpoint: "https://oauth2.googleapis.com/token",
		userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
	};
}

export function assertOAuthProviderConfigured(
	config: OAuthProviderConfig,
): void {
	if (!config.clientId || !config.clientSecret) {
		throw new Error(
			`${config.provider} OAuth requires client id and client secret environment variables.`,
		);
	}
}

export function buildOAuthAuthorizationRequest(input: {
	env?: EnvLike;
	provider: OAuthProvider;
	requestUrl: URL | string;
	returnTo?: string | null;
	state?: string;
	codeVerifier?: string;
}): OAuthAuthorizationRequest {
	const requestUrl = new URL(input.requestUrl);
	const config = oauthProviderConfig(input.provider, input.env);
	assertOAuthProviderConfigured(config);

	const state = input.state ?? randomToken();
	const codeVerifier = input.codeVerifier ?? randomToken(48);
	const redirectUri = oauthRedirectUri(input.provider, requestUrl, input.env);
	const returnTo = normalizeOAuthReturnTo(input.returnTo);
	const authorizationUrl = new URL(config.authorizationEndpoint);

	authorizationUrl.searchParams.set("client_id", config.clientId);
	authorizationUrl.searchParams.set("code_challenge", pkceChallenge(codeVerifier));
	authorizationUrl.searchParams.set("code_challenge_method", "S256");
	authorizationUrl.searchParams.set("redirect_uri", redirectUri);
	authorizationUrl.searchParams.set("response_type", "code");
	authorizationUrl.searchParams.set("scope", config.scopes.join(" "));
	authorizationUrl.searchParams.set("state", state);
	authorizationUrl.searchParams.set("prompt", "select_account");

	return {
		authorizationUrl,
		cookie: {
			name: oauthStateCookieName(input.provider),
			value: encodeOAuthStateCookie({
				codeVerifier,
				provider: input.provider,
				returnTo,
				state,
			}),
			maxAgeSeconds: OAUTH_STATE_TTL_SECONDS,
		},
	};
}

export function oauthRedirectUri(
	provider: OAuthProvider,
	requestUrl: URL | string,
	env: EnvLike = process.env,
): string {
	const explicit =
		provider === "microsoft"
			? env.MICROSOFT_OAUTH_REDIRECT_URI ?? env.AZURE_AD_REDIRECT_URI
			: env.GOOGLE_OAUTH_REDIRECT_URI ?? env.GOOGLE_REDIRECT_URI;

	if (explicit?.trim()) {
		return explicit.trim();
	}

	const requestOrigin = new URL(requestUrl).origin;
	const baseUrl = env.APP_BASE_URL?.trim() || requestOrigin;
	return new URL(`/api/auth/oauth/${provider}/callback`, baseUrl).toString();
}

export async function exchangeOAuthCode(input: {
	env?: EnvLike;
	fetchImpl?: typeof fetch;
	provider: OAuthProvider;
	requestUrl: URL | string;
	code: string;
	codeVerifier: string;
}): Promise<{ accessToken: string; idTokenClaims: OAuthTokenClaims | null }> {
	const config = oauthProviderConfig(input.provider, input.env);
	assertOAuthProviderConfigured(config);

	const body = new URLSearchParams({
		client_id: config.clientId,
		client_secret: config.clientSecret,
		code: input.code,
		code_verifier: input.codeVerifier,
		grant_type: "authorization_code",
		redirect_uri: oauthRedirectUri(input.provider, input.requestUrl, input.env),
		scope: config.scopes.join(" "),
	});
	const response = await (input.fetchImpl ?? fetch)(config.tokenEndpoint, {
		body,
		headers: {
			accept: "application/json",
			"content-type": "application/x-www-form-urlencoded",
		},
		method: "POST",
	});

	if (!response.ok) {
		throw new Error(
			`${input.provider} OAuth token exchange failed with status ${response.status}.`,
		);
	}

	const payload = (await response.json()) as {
		access_token?: unknown;
		id_token?: unknown;
	};
	if (typeof payload.access_token !== "string" || !payload.access_token) {
		throw new Error(`${input.provider} OAuth token response did not include an access token.`);
	}

	return {
		accessToken: payload.access_token,
		idTokenClaims:
			typeof payload.id_token === "string"
				? decodeJwtPayload(payload.id_token)
				: null,
	};
}

export async function fetchOAuthUserInfo(input: {
	env?: EnvLike;
	fetchImpl?: typeof fetch;
	provider: OAuthProvider;
	accessToken: string;
}): Promise<OAuthUserInfo> {
	const config = oauthProviderConfig(input.provider, input.env);
	const response = await (input.fetchImpl ?? fetch)(config.userInfoEndpoint, {
		headers: {
			accept: "application/json",
			authorization: `Bearer ${input.accessToken}`,
		},
		method: "GET",
	});

	if (!response.ok) {
		throw new Error(
			`${input.provider} OAuth userinfo request failed with status ${response.status}.`,
		);
	}

	return (await response.json()) as OAuthUserInfo;
}

export function extractVerifiedOAuthEmail(
	provider: OAuthProvider,
	userInfo: OAuthUserInfo,
	idTokenClaims: OAuthTokenClaims | null = null,
): string | null {
	if (provider === "google") {
		const claims = idTokenClaims ?? userInfo;
		if (!isTruthyEmailVerified(claims.email_verified)) {
			return null;
		}

		return normalizedEmailFromClaim(claims.email);
	}

	const claims = idTokenClaims ?? userInfo;
	if (!isTruthyEmailVerified(claims.xms_edov)) {
		return null;
	}

	return normalizedEmailFromClaim(claims.email);
}

export function extractOAuthSubject(
	provider: OAuthProvider,
	userInfo: OAuthUserInfo,
	idTokenClaims: OAuthTokenClaims | null = null,
): string | null {
	const claims = idTokenClaims ?? userInfo;
	const subject = typeof claims.sub === "string" ? claims.sub.trim() : "";
	if (subject) {
		return subject;
	}

	if (provider === "microsoft" && typeof claims.oid === "string") {
		const tenantId = typeof claims.tid === "string" ? claims.tid.trim() : "";
		const objectId = claims.oid.trim();
		return tenantId && objectId ? `${tenantId}:${objectId}` : objectId || null;
	}

	return null;
}

export function decodeOAuthStateCookie(value: string): OAuthStateCookie | null {
	try {
		const parsed = JSON.parse(
			Buffer.from(value, "base64url").toString("utf8"),
		) as Partial<OAuthStateCookie>;
		const provider = parsed.provider;

		if (
			!provider ||
			!isOAuthProvider(provider) ||
			typeof parsed.state !== "string" ||
			typeof parsed.codeVerifier !== "string" ||
			typeof parsed.returnTo !== "string" ||
			!parsed.state ||
			!parsed.codeVerifier
		) {
			return null;
		}

		return {
			codeVerifier: parsed.codeVerifier,
			provider,
			returnTo: normalizeOAuthReturnTo(parsed.returnTo),
			state: parsed.state,
		};
	} catch {
		return null;
	}
}

export function normalizeOAuthReturnTo(value: string | null | undefined): string {
	if (!value) {
		return "/workspace";
	}

	const trimmed = value.trim();
	if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
		return "/workspace";
	}

	return trimmed;
}

function encodeOAuthStateCookie(value: OAuthStateCookie): string {
	return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function normalizedEmailFromClaim(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const email = normalizeMagicLinkEmail(value);
	return isValidMagicLinkEmail(email) ? email : null;
}

function isTruthyEmailVerified(value: unknown): boolean {
	return value === true || value === "true";
}

function decodeJwtPayload(token: string): OAuthTokenClaims | null {
	const [, payload] = token.split(".");
	if (!payload) {
		return null;
	}

	try {
		const decoded = JSON.parse(
			Buffer.from(payload, "base64url").toString("utf8"),
		) as OAuthTokenClaims;
		if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
			return null;
		}

		return decoded;
	} catch {
		return null;
	}
}

function pkceChallenge(codeVerifier: string): string {
	return createHash("sha256").update(codeVerifier).digest("base64url");
}

function randomToken(bytes = 32): string {
	return randomBytes(bytes).toString("base64url");
}
