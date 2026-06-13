import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { withTenantConnection } from "../db";
import type { LLMVisionImage } from "./types";

export type VisionCallAuditInput = {
	readonly tenantId: string;
	readonly workflowId: string;
	readonly userId: string;
	readonly photoHash: string;
	readonly provider: string;
	readonly model: string;
	readonly promptPurpose: string;
	readonly calledAt?: Date;
	readonly latencyMs: number;
	readonly tokenCostUsd?: number | string | null;
};

export type VisionCallAuditLog = {
	readonly id: string;
	readonly tenantId: string;
	readonly workflowId: string;
	readonly userId: string;
	readonly photoHash: string;
	readonly provider: string;
	readonly model: string;
	readonly promptPurpose: string;
};

export type VisionCallAuditLogger = (line: string) => void;

export type RecordVisionCallOptions = {
	readonly logger?: VisionCallAuditLogger;
};

export async function recordVisionCall(
	input: VisionCallAuditInput,
	options: RecordVisionCallOptions = {},
): Promise<VisionCallAuditLog> {
	const row = {
		id: randomUUID(),
		tenantId: input.tenantId,
		workflowId: input.workflowId,
		userId: input.userId,
		photoHash: input.photoHash,
		provider: input.provider,
		model: input.model,
		promptPurpose: input.promptPurpose,
	};
	const calledAt = input.calledAt ?? new Date();
	const tokenCostUsd = new Prisma.Decimal(input.tokenCostUsd ?? 0);

	await withTenantConnection(input.tenantId, async (tx) => {
		await tx.$executeRaw`
			INSERT INTO vision_call_audit (
				id,
				tenant_id,
				workflow_id,
				user_id,
				photo_hash,
				provider,
				model,
				prompt_purpose,
				called_at,
				latency_ms,
				token_cost_usd
			) VALUES (
				${row.id}::uuid,
				${row.tenantId}::uuid,
				${row.workflowId}::uuid,
				${row.userId}::uuid,
				${row.photoHash},
				${row.provider},
				${row.model},
				${row.promptPurpose},
				${calledAt},
				${Math.max(0, Math.trunc(input.latencyMs))},
				${tokenCostUsd}
			)
		`;
	});

	options.logger?.(
		[
			"vision_call_audit",
			`id=${row.id}`,
			`tenant_id=${row.tenantId}`,
			`workflow_id=${row.workflowId}`,
			`user_id=${row.userId}`,
			`photo_hash=${row.photoHash}`,
			`provider=${row.provider}`,
			`model=${row.model}`,
			`prompt_purpose=${row.promptPurpose}`,
		].join(" "),
	);

	return row;
}

export function hashVisionPhotos(photos: readonly LLMVisionImage[]): string {
	const hash = createHash("sha256");

	for (const photo of photos) {
		hash.update(photoDataToBuffer(photo));
	}

	return hash.digest("hex");
}

export function photoDataToBuffer(photo: LLMVisionImage): Buffer {
	if (typeof photo.data === "string") {
		const base64 = photo.data.startsWith("data:")
			? (photo.data.split(",", 2)[1] ?? "")
			: photo.data;
		return Buffer.from(base64, "base64");
	}

	if (photo.data instanceof ArrayBuffer) {
		return Buffer.from(photo.data);
	}

	return Buffer.from(
		photo.data.buffer,
		photo.data.byteOffset,
		photo.data.byteLength,
	);
}
