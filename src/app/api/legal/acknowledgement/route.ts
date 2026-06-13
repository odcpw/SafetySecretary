import { PrismaClient } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server.js";
import { SESSION_COOKIE_NAME } from "../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../lib/auth/session";
import { DISCLAIMER_VERSION } from "../../../../lib/legal/disclaimer";

export const runtime = "nodejs";

export type UserAcknowledgementStore = {
	acknowledge(input: {
		disclaimerVersion: string;
		userId: string;
	}): Promise<void>;
};

type GlobalState = typeof globalThis & {
	__ssfwAcknowledgementRoutePrisma?: PrismaClient;
};

const globalState = globalThis as GlobalState;

export async function POST(request: NextRequest): Promise<NextResponse> {
	return handleAcknowledgementPost(request);
}

export async function handleAcknowledgementPost(
	request: NextRequest,
	store: UserAcknowledgementStore = new PrismaUserAcknowledgementStore(),
	sessionResolver: typeof resolveSession = resolveSession,
): Promise<NextResponse> {
	const session = await sessionResolver(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!(await readAcknowledgement(request))) {
		return NextResponse.json(
			{ code: "ACKNOWLEDGEMENT_REQUIRED" },
			{ status: 400 },
		);
	}

	await store.acknowledge({
		disclaimerVersion: DISCLAIMER_VERSION,
		userId: session.userId,
	});

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(
				safeReturnTo(request.nextUrl.searchParams.get("returnTo")),
				request.url,
			),
			303,
		);
	}

	return NextResponse.json({ disclaimerVersion: DISCLAIMER_VERSION });
}

export class PrismaUserAcknowledgementStore
	implements UserAcknowledgementStore
{
	private readonly prisma: PrismaClient;

	constructor(prisma: PrismaClient = getPrismaClient()) {
		this.prisma = prisma;
	}

	async acknowledge(input: {
		disclaimerVersion: string;
		userId: string;
	}): Promise<void> {
		await this.prisma.userAcknowledgement.upsert({
			create: {
				disclaimerVersion: input.disclaimerVersion,
				userId: input.userId,
			},
			update: {
				acknowledgedAt: new Date(),
			},
			where: {
				userId_disclaimerVersion: {
					disclaimerVersion: input.disclaimerVersion,
					userId: input.userId,
				},
			},
		});
	}
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

async function readAcknowledgement(request: NextRequest): Promise<boolean> {
	const contentType = request.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		const body = (await request.json().catch(() => null)) as {
			acknowledge?: unknown;
		} | null;
		return body?.acknowledge === true;
	}

	const formData = await request.formData().catch(() => null);
	return formData?.get("acknowledge") === "true";
}

function wantsHtmlRedirect(request: NextRequest): boolean {
	const accept = request.headers.get("accept") ?? "";
	const contentType = request.headers.get("content-type") ?? "";

	return (
		accept.includes("text/html") || contentType.includes("form-urlencoded")
	);
}

function safeReturnTo(value: string | null): string {
	if (!value?.startsWith("/") || value.startsWith("//")) {
		return "/workspace";
	}

	return value;
}

function getPrismaClient(): PrismaClient {
	if (!globalState.__ssfwAcknowledgementRoutePrisma) {
		globalState.__ssfwAcknowledgementRoutePrisma = new PrismaClient();
	}

	return globalState.__ssfwAcknowledgementRoutePrisma;
}
