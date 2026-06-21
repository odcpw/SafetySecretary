import { PrismaClient } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server.js";
import { readSessionCookie } from "../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../lib/auth/session";
import { normalizeLocalReturnTo } from "../../../../lib/auth/return-to";
import { DISCLAIMER_VERSION } from "../../../../lib/legal/disclaimer";

export const runtime = "nodejs";

export type UserAcknowledgementStore = {
	acknowledge(input: {
		disclaimerVersion: string;
		userId: string;
	}): Promise<void>;
};

type GlobalState = typeof globalThis & {
	__safetySecretaryAcknowledgementRoutePrisma?: PrismaClient;
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
	return validateSession(readSessionCookie(request.cookies));
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
	return normalizeLocalReturnTo(value);
}

function getPrismaClient(): PrismaClient {
	if (!globalState.__safetySecretaryAcknowledgementRoutePrisma) {
		globalState.__safetySecretaryAcknowledgementRoutePrisma =
			new PrismaClient();
	}

	return globalState.__safetySecretaryAcknowledgementRoutePrisma;
}
