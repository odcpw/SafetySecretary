import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import type {
	CostLedgerEntryRow,
	CostStore,
	MonthToDateInput,
	TenantCostSettings,
} from "../../../src/lib/llm/cost";
import type { LLMTextRequest } from "../../../src/lib/llm/types";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (context.parentURL && specifier.startsWith(".")) {
			const candidates = [
				new URL(`${specifier}.ts`, context.parentURL),
				new URL(`${specifier}.tsx`, context.parentURL),
				new URL(`${specifier}/index.ts`, context.parentURL),
			];
			const resolved = candidates.find((candidate) => existsSync(candidate));

			if (resolved) {
				return {
					shortCircuit: true,
					url: resolved.href,
				};
			}
		}

		return nextResolve(specifier, context);
	},
});

const costModulePath = "../../../src/lib/llm/cost.ts";
const {
	DEFAULT_MONTHLY_CAP_USD,
	SELF_HOST_PER_COMPANY_CAP_USD_ENV,
	checkAndConsumeCap,
	monthToDateUsd,
	recordCost,
} = (await import(costModulePath)) as typeof import("../../../src/lib/llm/cost");

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

test("schema and SQL expose tenant cap override and tenant-local cost ledger", () => {
	const schema = readFileSync("prisma/schema.prisma", "utf8");
	const sql = readFileSync("db/sql/00130_cost_ledger.sql", "utf8");

	assert.match(schema, /monthlyCapUsd\s+Decimal\?/);
	assert.match(schema, /@map\("monthly_cap_usd"\)/);
	assert.match(schema, /enum CostLedgerKind/);
	assert.match(schema, /model CostLedgerEntry/);
	assert.match(schema, /costUsd\s+Decimal\s+@map\("cost_usd"\)\s+@db\.Decimal\(10, 5\)/);
	assert.match(sql, /ADD COLUMN IF NOT EXISTS "monthly_cap_usd" numeric\(10, 2\) NULL/);
	assert.match(sql, /CREATE TABLE IF NOT EXISTS %I\.cost_ledger_entry/);
	assert.match(sql, /kind %I\.cost_ledger_kind NOT NULL/);
	assert.match(sql, /token_input integer NOT NULL/);
	assert.match(sql, /token_output integer NOT NULL/);
	assert.match(sql, /cost_usd numeric\(10, 5\) NOT NULL/);
	assert.match(sql, /cost_ledger_entry_called_at_idx/);
});

test("recordCost writes the ledger row shape used for cap aggregation", async () => {
	const store = new MemoryCostStore();
	const calledAt = new Date("2026-05-05T12:00:00.000Z");

	const row = await recordCost(
		{
			tenantId,
			id: "33333333-3333-4333-8333-333333333333",
			calledAt,
			kind: "authoring",
			provider: "openai",
			tokenInput: 12.9,
			tokenOutput: 4.1,
			costUsd: "1.234567",
		},
		{ store },
	);

	assert.deepEqual(row, {
		id: "33333333-3333-4333-8333-333333333333",
		tenantId,
		calledAt,
		kind: "authoring",
		provider: "openai",
		tokenInput: 12,
		tokenOutput: 4,
		costUsd: "1.23457",
	});
	assert.deepEqual(store.records, [row]);
});

test("hosted SaaS default cap allows 4.99 USD and caps after crossing 5.00 USD", async () => {
	const now = new Date("2026-05-05T12:00:00.000Z");
	const store = new MemoryCostStore();
	await insertCost(store, "4.99000", now);

	assert.equal(DEFAULT_MONTHLY_CAP_USD, 5);
	assert.equal(
		(
			await checkAndConsumeCap(textRequest(), tenantId, {
				store,
				now: () => now,
				deployment: "hostedSaaS",
			})
		).ok,
		true,
	);

	await insertCost(store, "0.02000", now);
	const capped = await checkAndConsumeCap(textRequest(), tenantId, {
		store,
		now: () => now,
		deployment: "hostedSaaS",
	});

	assert.equal(capped.ok, false);
	assert.equal(capped.ok ? "" : capped.code, "monthly_cap_exceeded");
	assert.equal(capped.ok ? "" : capped.error.upgradePath, "byok");
	assert.equal(capped.ok ? 0 : capped.monthToDateUsd, 5.01);
});

test("per-company hosted cap override replaces the 5 USD default", async () => {
	const now = new Date("2026-05-05T12:00:00.000Z");
	const store = new MemoryCostStore({
		settings: {
			monthlyCapUsd: "10.00",
			hasByokProviderConfig: false,
			hasLocalOverrideConfig: false,
		},
	});
	await insertCost(store, "6.00000", now);

	assert.equal(
		(
			await checkAndConsumeCap(textRequest(), tenantId, {
				store,
				now: () => now,
				deployment: "hostedSaaS",
			})
		).ok,
		true,
	);

	await insertCost(store, "4.01000", now);
	const capped = await checkAndConsumeCap(textRequest(), tenantId, {
		store,
		now: () => now,
		deployment: "hostedSaaS",
	});

	assert.equal(capped.ok, false);
	assert.equal(capped.ok ? 0 : capped.capUsd, 10);
	assert.equal(capped.ok ? "" : capped.error.upgradePath, "byok");
});

test("caps reset on the first day of each UTC month", async () => {
	const store = new MemoryCostStore();
	await insertCost(store, "9.00000", new Date("2026-04-30T23:59:59.000Z"));
	await insertCost(store, "1.25000", new Date("2026-05-01T00:00:00.000Z"));
	await insertCost(store, "2.00000", new Date("2026-06-01T00:00:00.000Z"));

	assert.equal(
		await monthToDateUsd(tenantId, {
			store,
			now: () => new Date("2026-05-05T12:00:00.000Z"),
		}),
		1.25,
	);
});

test("BYOK and local override companies bypass hosted caps", async () => {
	for (const settings of [
		{
			monthlyCapUsd: null,
			hasByokProviderConfig: true,
			hasLocalOverrideConfig: false,
		},
		{
			monthlyCapUsd: null,
			hasByokProviderConfig: false,
			hasLocalOverrideConfig: true,
		},
	] satisfies TenantCostSettings[]) {
		const now = new Date("2026-05-05T12:00:00.000Z");
		const store = new MemoryCostStore({ settings });
		await insertCost(store, "99.00000", now);

		assert.equal(
			(
				await checkAndConsumeCap(textRequest(), tenantId, {
					store,
					now: () => now,
					deployment: "hostedSaaS",
				})
			).ok,
			true,
		);
	}
});

test("self-host caps are disabled unless SELF_HOST_PER_COMPANY_CAP_USD is set", async () => {
	const now = new Date("2026-05-05T12:00:00.000Z");
	const store = new MemoryCostStore();
	await insertCost(store, "99.00000", now);

	assert.equal(
		(
			await checkAndConsumeCap(textRequest(), tenantId, {
				store,
				now: () => now,
				deployment: "selfHosted",
				env: {},
			})
		).ok,
		true,
	);
	assert.equal(store.settingsReads, 0);

	const capped = await checkAndConsumeCap(textRequest(), tenantId, {
		store,
		now: () => now,
		deployment: "selfHosted",
		env: { [SELF_HOST_PER_COMPANY_CAP_USD_ENV]: "5.00" },
	});

	assert.equal(capped.ok, false);
	assert.equal(capped.ok ? "" : capped.code, "monthly_cap_exceeded");
	assert.equal(capped.ok ? "" : capped.error.upgradePath, "local");
});

class MemoryCostStore implements CostStore {
	readonly records: CostLedgerEntryRow[] = [];
	readonly settings: TenantCostSettings | null;
	settingsReads = 0;

	constructor(
		options: {
			settings?: TenantCostSettings | null;
		} = {},
	) {
		this.settings = options.settings ?? {
			monthlyCapUsd: null,
			hasByokProviderConfig: false,
			hasLocalOverrideConfig: false,
		};
	}

	async recordCost(input: CostLedgerEntryRow): Promise<CostLedgerEntryRow> {
		this.records.push(input);
		return input;
	}

	async monthToDateUsd(input: MonthToDateInput): Promise<number> {
		const total = this.records
			.filter(
				(row) =>
					row.tenantId === input.tenantId &&
					row.calledAt >= input.startOfMonthUtc &&
					row.calledAt < input.endOfMonthUtc,
			)
			.reduce((sum, row) => sum + Number(row.costUsd), 0);

		return Number(total.toFixed(5));
	}

	async readTenantCostSettings(): Promise<TenantCostSettings | null> {
		this.settingsReads += 1;
		return this.settings;
	}
}

async function insertCost(
	store: MemoryCostStore,
	costUsd: string,
	calledAt: Date,
): Promise<CostLedgerEntryRow> {
	return recordCost(
		{
			tenantId,
			calledAt,
			kind: "authoring",
			provider: "openai",
			tokenInput: 10,
			tokenOutput: 5,
			costUsd,
		},
		{ store },
	);
}

function textRequest(): LLMTextRequest {
	return {
		prompt: "Summarize this safety note.",
		options: {
			tenantId,
			userId,
			workflowId: "44444444-4444-4444-8444-444444444444",
			locale: "en",
			promptPurpose: "cost.text",
			kind: "authoring",
			requiresVision: false,
		},
	};
}
