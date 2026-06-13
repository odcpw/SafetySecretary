import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma, withTenantConnection } from "../db";
import {
	MonthlyCapExceededError,
	type MonthlyCapUpgradePath,
} from "./errors";
import type { KindEnum, LLMRequest } from "./types";

export const DEFAULT_MONTHLY_CAP_USD = 5;
export const SELF_HOST_PER_COMPANY_CAP_USD_ENV =
	"SELF_HOST_PER_COMPANY_CAP_USD";

type EnvLike = Pick<NodeJS.ProcessEnv, string>;

export type CostCapDeployment = "hostedSaaS" | "selfHosted";

export type CostLedgerEntryInput = {
	readonly tenantId: string;
	readonly id?: string;
	readonly calledAt?: Date;
	readonly kind: KindEnum;
	readonly provider: string;
	readonly tokenInput: number;
	readonly tokenOutput: number;
	readonly costUsd: number | string | Prisma.Decimal;
};

export type CostLedgerEntryRow = {
	readonly id: string;
	readonly tenantId: string;
	readonly calledAt: Date;
	readonly kind: KindEnum;
	readonly provider: string;
	readonly tokenInput: number;
	readonly tokenOutput: number;
	readonly costUsd: string;
};

export type TenantCostSettings = {
	readonly monthlyCapUsd: number | string | Prisma.Decimal | null;
	readonly hasByokProviderConfig: boolean;
	readonly hasLocalOverrideConfig: boolean;
};

export type MonthToDateInput = {
	readonly tenantId: string;
	readonly startOfMonthUtc: Date;
	readonly endOfMonthUtc: Date;
};

export type CostStore = {
	recordCost(input: CostLedgerEntryRow): Promise<CostLedgerEntryRow>;
	monthToDateUsd(input: MonthToDateInput): Promise<number>;
	readTenantCostSettings(input: {
		tenantId: string;
	}): Promise<TenantCostSettings | null>;
};

export type CostOptions = {
	readonly store?: CostStore;
	readonly now?: () => Date;
};

export type CheckAndConsumeCapOptions = CostOptions & {
	readonly env?: EnvLike;
	readonly deployment?: CostCapDeployment;
	readonly upgradePath?: MonthlyCapUpgradePath;
};

export type MonthlyCapCheckResult =
	| {
			readonly ok: true;
	  }
	| {
			readonly ok: false;
			readonly code: "monthly_cap_exceeded";
			readonly error: MonthlyCapExceededError;
			readonly upgradePath: MonthlyCapUpgradePath;
			readonly capUsd: number;
			readonly monthToDateUsd: number;
	  };

export async function recordCost(
	input: CostLedgerEntryInput,
	options: Pick<CostOptions, "store"> = {},
): Promise<CostLedgerEntryRow> {
	return (options.store ?? new PrismaCostStore()).recordCost(
		costLedgerEntryRow(input),
	);
}

export async function monthToDateUsd(
	tenantId: string,
	options: CostOptions = {},
): Promise<number> {
	const window = monthWindowUtc(options.now?.() ?? new Date());
	return (options.store ?? new PrismaCostStore()).monthToDateUsd({
		tenantId,
		...window,
	});
}

export async function checkAndConsumeCap(
	req: LLMRequest,
	tenantId: string,
	options: CheckAndConsumeCapOptions = {},
): Promise<MonthlyCapCheckResult> {
	if (req.options.tenantId !== tenantId) {
		throw new Error("Cost cap tenantId must match the LLM request tenantId.");
	}

	const env = options.env ?? process.env;
	const deployment =
		options.deployment ??
		(nonEmpty(env.LLM_BASE_URL) ? "selfHosted" : "hostedSaaS");

	const capUsd = capUsdForDeployment(deployment, env);
	if (capUsd === null) {
		return { ok: true };
	}

	const store = options.store ?? new PrismaCostStore();
	const settings = await store.readTenantCostSettings({ tenantId });
	if (
		settings?.hasByokProviderConfig === true ||
		settings?.hasLocalOverrideConfig === true
	) {
		return { ok: true };
	}

	const effectiveCapUsd =
		deployment === "hostedSaaS"
			? parseCapUsd(settings?.monthlyCapUsd ?? DEFAULT_MONTHLY_CAP_USD)
			: capUsd;
	const monthToDate = await monthToDateUsd(tenantId, {
		store,
		now: options.now,
	});

	if (new Prisma.Decimal(monthToDate).lessThan(effectiveCapUsd)) {
		return { ok: true };
	}

	const upgradePath =
		options.upgradePath ?? (deployment === "selfHosted" ? "local" : "byok");
	const error = new MonthlyCapExceededError({ upgradePath });

	return {
		ok: false,
		code: error.code,
		error,
		upgradePath,
		capUsd: effectiveCapUsd.toNumber(),
		monthToDateUsd: monthToDate,
	};
}

export function monthWindowUtc(now: Date): {
	readonly startOfMonthUtc: Date;
	readonly endOfMonthUtc: Date;
} {
	const startOfMonthUtc = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
	);
	const endOfMonthUtc = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
	);

	return { startOfMonthUtc, endOfMonthUtc };
}

function costLedgerEntryRow(input: CostLedgerEntryInput): CostLedgerEntryRow {
	return {
		id: input.id ?? randomUUID(),
		tenantId: input.tenantId,
		calledAt: input.calledAt ?? new Date(),
		kind: input.kind,
		provider: input.provider,
		tokenInput: nonNegativeInteger(input.tokenInput, "tokenInput"),
		tokenOutput: nonNegativeInteger(input.tokenOutput, "tokenOutput"),
		costUsd: parseCostUsd(input.costUsd).toFixed(5),
	};
}

class PrismaCostStore implements CostStore {
	private readonly prisma: PrismaClient;

	constructor(prismaClient: PrismaClient = prisma) {
		this.prisma = prismaClient;
	}

	async recordCost(row: CostLedgerEntryRow): Promise<CostLedgerEntryRow> {
		await withTenantConnection(row.tenantId, async (tx) => {
			await tx.$executeRaw`
				INSERT INTO cost_ledger_entry (
					id,
					called_at,
					kind,
					provider,
					token_input,
					token_output,
					cost_usd
				) VALUES (
					${row.id}::uuid,
					${row.calledAt},
					${row.kind}::cost_ledger_kind,
					${row.provider},
					${row.tokenInput},
					${row.tokenOutput},
					${new Prisma.Decimal(row.costUsd)}
				)
			`;
		});

		return row;
	}

	async monthToDateUsd(input: MonthToDateInput): Promise<number> {
		const rows = await withTenantConnection(input.tenantId, async (tx) =>
			tx.$queryRaw<Array<{ total: string | null }>>`
				SELECT COALESCE(SUM(cost_usd), 0)::text AS total
				FROM cost_ledger_entry
				WHERE called_at >= ${input.startOfMonthUtc}
				  AND called_at < ${input.endOfMonthUtc}
			`,
		);

		return new Prisma.Decimal(rows[0]?.total ?? 0).toNumber();
	}

	async readTenantCostSettings(input: {
		tenantId: string;
	}): Promise<TenantCostSettings | null> {
		const rows = await this.prisma.$queryRaw<
			Array<{
				monthlyCapUsd: string | null;
				hasByokProviderConfig: boolean;
				hasLocalOverrideConfig: boolean;
			}>
		>`
			SELECT
				monthly_cap_usd::text AS "monthlyCapUsd",
				byok_provider_config_ciphertext IS NOT NULL AS "hasByokProviderConfig",
				local_override_config IS NOT NULL AS "hasLocalOverrideConfig"
			FROM shared.tenants
			WHERE id = ${input.tenantId}::uuid
			LIMIT 1
		`;

		return rows[0] ?? null;
	}
}

function capUsdForDeployment(
	deployment: CostCapDeployment,
	env: EnvLike,
): Prisma.Decimal | null {
	if (deployment === "hostedSaaS") {
		return new Prisma.Decimal(DEFAULT_MONTHLY_CAP_USD);
	}

	const configured = env[SELF_HOST_PER_COMPANY_CAP_USD_ENV];
	if (!nonEmpty(configured)) {
		return null;
	}

	return parseCapUsd(configured);
}

function parseCapUsd(value: number | string | Prisma.Decimal): Prisma.Decimal {
	const parsed = new Prisma.Decimal(value);
	if (parsed.isNegative()) {
		throw new Error("Monthly LLM cap must be zero or greater.");
	}

	return parsed;
}

function parseCostUsd(value: number | string | Prisma.Decimal): Prisma.Decimal {
	const parsed = new Prisma.Decimal(value);
	if (parsed.isNegative()) {
		throw new Error("LLM cost must be zero or greater.");
	}

	return parsed;
}

function nonNegativeInteger(value: number, label: string): number {
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`${label} must be a non-negative number.`);
	}

	return Math.trunc(value);
}

function nonEmpty(value: string | undefined): value is string {
	return typeof value === "string" && value.trim().length > 0;
}
