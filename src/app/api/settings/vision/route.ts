import { type NextRequest, NextResponse } from "next/server";
import {
	CSRF_COOKIE_NAME,
	SESSION_COOKIE_NAME,
} from "../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../lib/auth/session";
import { prisma } from "../../../../lib/db";

export const runtime = "nodejs";

export type VisionSettingsStore = {
	read(input: VisionSettingsStoreInput): Promise<boolean | null>;
	update(input: VisionSettingsUpdateInput): Promise<boolean>;
};

type VisionSettingsStoreInput = {
	tenantId: string;
	userId: string;
};

type VisionSettingsUpdateInput = VisionSettingsStoreInput & {
	visionEnabled: boolean;
};

type VisionPayload =
	| { ok: true; tenantId: string | null; visionEnabled: boolean }
	| { code: "INVALID_TENANT_ID" | "INVALID_VISION_SETTING"; ok: false };

type SessionValidator = (
	cookieValue: string | null | undefined,
) => Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null>;

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
	return handleVisionSettingsGet(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	return handleVisionSettingsPost(request);
}

export async function handleVisionSettingsGet(
	request: NextRequest,
	store: VisionSettingsStore = new PrismaVisionSettingsStore(),
	sessionValidator: SessionValidator = validateSession,
): Promise<NextResponse> {
	const session = await resolveSession(request, sessionValidator);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const visionEnabled = await store.read({
		tenantId: session.tenantId,
		userId: session.userId,
	});

	if (visionEnabled === null) {
		return NextResponse.json(
			{ code: "TENANT_MEMBERSHIP_REQUIRED" },
			{ status: 403 },
		);
	}

	return NextResponse.json({ visionEnabled });
}

export async function handleVisionSettingsPost(
	request: NextRequest,
	store: VisionSettingsStore = new PrismaVisionSettingsStore(),
	sessionValidator: SessionValidator = validateSession,
): Promise<NextResponse> {
	const session = await resolveSession(request, sessionValidator);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!hasValidCsrfToken(request)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	const payload = await readVisionPayload(request);

	if (!payload.ok) {
		return NextResponse.json({ code: payload.code }, { status: 400 });
	}

	if (payload.tenantId && payload.tenantId !== session.tenantId) {
		return NextResponse.json(
			{ code: "VISION_SETTING_NOT_FOUND" },
			{ status: 404 },
		);
	}

	const updated = await store.update({
		tenantId: session.tenantId,
		userId: session.userId,
		visionEnabled: payload.visionEnabled,
	});

	if (!updated) {
		return NextResponse.json(
			{ code: "TENANT_MEMBERSHIP_REQUIRED" },
			{ status: 403 },
		);
	}

	return NextResponse.json({ visionEnabled: payload.visionEnabled });
}

export class PrismaVisionSettingsStore implements VisionSettingsStore {
	async read(input: VisionSettingsStoreInput): Promise<boolean | null> {
		const tenant = await prisma.tenant.findFirst({
			select: { visionEnabled: true },
			where: {
				id: input.tenantId,
				memberships: {
					some: { userId: input.userId },
				},
			},
		});

		return tenant?.visionEnabled ?? null;
	}

	async update(input: VisionSettingsUpdateInput): Promise<boolean> {
		const result = await prisma.tenant.updateMany({
			data: { visionEnabled: input.visionEnabled },
			where: {
				id: input.tenantId,
				memberships: {
					some: { userId: input.userId },
				},
			},
		});

		return result.count === 1;
	}
}

async function resolveSession(
	request: NextRequest,
	sessionValidator: SessionValidator,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return sessionValidator(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

async function readVisionPayload(request: NextRequest): Promise<VisionPayload> {
	const contentType = request.headers.get("content-type") ?? "";
	const body = contentType.includes("application/json")
		? ((await request.json().catch(() => null)) as Record<
				string,
				unknown
			> | null)
		: Object.fromEntries((await request.formData().catch(() => null)) ?? []);
	const tenantId = parseOptionalTenantId(body?.tenantId);

	if (tenantId === false) {
		return { code: "INVALID_TENANT_ID", ok: false };
	}

	const visionEnabled = parseBoolean(body?.visionEnabled ?? body?.enabled);

	if (visionEnabled === null) {
		return { code: "INVALID_VISION_SETTING", ok: false };
	}

	return {
		ok: true,
		tenantId,
		visionEnabled,
	};
}

function parseOptionalTenantId(value: unknown): string | false | null {
	if (value === undefined || value === null || value === "") {
		return null;
	}

	if (typeof value === "string" && uuidPattern.test(value)) {
		return value.toLowerCase();
	}

	return false;
}

function parseBoolean(value: unknown): boolean | null {
	if (typeof value === "boolean") {
		return value;
	}

	if (value === "true") {
		return true;
	}

	if (value === "false") {
		return false;
	}

	return null;
}

function hasValidCsrfToken(request: NextRequest): boolean {
	const cookie = request.cookies.get(CSRF_COOKIE_NAME)?.value;
	const header = request.headers.get("x-ssfw-csrf");

	return Boolean(cookie && header && cookie === header);
}
