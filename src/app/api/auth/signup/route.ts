import { type NextRequest, NextResponse } from "next/server";
import { authBaseUrlForRequest } from "../../../../lib/auth/base-url";
import {
	MAGIC_LINK_RATE_LIMIT_MESSAGE,
	MAGIC_LINK_REQUEST_SUCCESS_MESSAGE,
	checkMagicLinkRequestRateLimit,
	isValidMagicLinkEmail,
	magicLinkClientIpFromHeaders,
	normalizeMagicLinkEmail,
	requestMagicLink,
} from "../../../../lib/auth/magic-link";
import { createEmailTransport } from "../../../../lib/email/transport";

export const runtime = "nodejs";

type SignupRequestBody = {
	email?: unknown;
	companyName?: unknown;
	company_name?: unknown;
	defaultLanguage?: unknown;
	default_language?: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
	const body = await readSignupRequest(request);
	const email = normalizeMagicLinkEmail(body.email);

	if (!isValidMagicLinkEmail(email)) {
		return NextResponse.json(
			{ message: "Enter a valid email address.", code: "invalid_email" },
			{ status: 400 },
		);
	}

	const rateLimit = await checkMagicLinkRequestRateLimit(email, {
		clientIp: magicLinkClientIpFromHeaders(request.headers),
	});
	if (!rateLimit.allowed) {
		return NextResponse.json(
			{ message: MAGIC_LINK_RATE_LIMIT_MESSAGE, code: "rate_limited" },
			{
				status: 429,
				headers: {
					"Retry-After": String(rateLimit.retryAfterSeconds),
				},
			},
		);
	}

	try {
		await requestMagicLink({
			email,
			transport: createEmailTransport(),
			baseUrl: authBaseUrlForRequest(),
			from: process.env.EMAIL_FROM ?? "no-reply@safetysecretary.local",
		});
	} catch {
		return NextResponse.json(
			{ message: "Sign-in link could not be requested." },
			{ status: 500 },
		);
	}

	return NextResponse.json(
		{ message: MAGIC_LINK_REQUEST_SUCCESS_MESSAGE },
		{ status: 202 },
	);
}

async function readSignupRequest(request: NextRequest): Promise<{
	email: string;
}> {
	const contentType = request.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		const body = (await request
			.json()
			.catch(() => null)) as SignupRequestBody | null;
		return {
			email: stringValue(body?.email),
		};
	}

	const formData = await request.formData().catch(() => null);

	return {
		email: stringValue(formData?.get("email")),
	};
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value : "";
}
