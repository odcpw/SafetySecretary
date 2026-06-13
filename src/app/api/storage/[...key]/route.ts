import { type NextRequest, NextResponse } from "next/server";
import {
	InvalidTenantStorageKeyError,
	type Storage,
	StorageNotFoundError,
	tenantStorage,
} from "../../../../lib/storage";
import {
	CrossTenantStorageKeyError,
	requireTenantSession,
	type StorageSessionValidator,
	TenantSessionRequiredError,
	tenantRelativeKeyFromStorageKey,
} from "../../../../lib/storage/auth";

export const runtime = "nodejs";

type StorageRouteContext = {
	params: Promise<{ key: string[] }> | { key: string[] };
};

export type DownloadRouteOptions = {
	readonly env?: NodeJS.ProcessEnv;
	readonly sessionValidator?: StorageSessionValidator;
	readonly storage?: Storage;
};

export async function GET(
	request: NextRequest,
	context: StorageRouteContext,
): Promise<NextResponse> {
	return handleStorageDownload(request, context);
}

export async function handleStorageDownload(
	request: Request,
	context: StorageRouteContext,
	options: DownloadRouteOptions = {},
): Promise<NextResponse> {
	const session = await requireTenantSession(request, {
		sessionValidator: options.sessionValidator,
	}).catch((error: unknown) => {
		if (error instanceof TenantSessionRequiredError) {
			return null;
		}
		throw error;
	});

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const { key } = await Promise.resolve(context.params);
	const storageKey = key.join("/");
	let relativeKey: string;

	try {
		relativeKey = tenantRelativeKeyFromStorageKey(storageKey, session.tenantId);
	} catch (error) {
		if (error instanceof CrossTenantStorageKeyError) {
			return NextResponse.json(
				{ code: "STORAGE_OBJECT_NOT_FOUND" },
				{ status: 404 },
			);
		}
		throw error;
	}

	const storage = tenantStorage(session.tenantId, {
		env: options.env,
		storage: options.storage,
	});
	const object = await storage.get(relativeKey).catch((error: unknown) => {
		if (
			error instanceof InvalidTenantStorageKeyError ||
			error instanceof StorageNotFoundError
		) {
			return null;
		}
		throw error;
	});

	if (!object) {
		return NextResponse.json(
			{ code: "STORAGE_OBJECT_NOT_FOUND" },
			{ status: 404 },
		);
	}

	return new NextResponse(new Uint8Array(object.body), {
		headers: {
			"content-length": String(object.metadata.sizeBytes),
			"content-type": object.metadata.contentType ?? "application/octet-stream",
		},
		status: 200,
	});
}
