import { resolveServerSession } from "../../../../lib/auth/route-session";
import { prisma } from "../../../../lib/db";
import {
	ALL_CAPABILITIES,
	Capability,
	type CapabilityOptions,
	capabilityConfigForTenant,
	ProviderMode,
	requireCapability,
	type TenantCapabilityInput,
} from "../../../../lib/llm/capabilities";

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CapabilityDetails = {
	readonly label: string;
	readonly ownerLabel: string;
	readonly ownerHref?: string;
	readonly runtimeSupported: boolean;
};

export type CapabilityMatrixRow = {
	readonly capability: Capability;
	readonly label: string;
	readonly state: "enabled" | "disabled" | "not_yet_supported";
	readonly providerMode: ProviderMode;
	readonly ownerLabel: string;
	readonly ownerHref?: string;
};

const CAPABILITY_DETAILS: Record<Capability, CapabilityDetails> = {
	[Capability.TextLlm]: {
		label: "Text LLM drafting",
		ownerLabel: "Provider settings",
		ownerHref: "/workspace/settings/byok",
		runtimeSupported: true,
	},
	[Capability.Vision]: {
		label: "Vision",
		ownerLabel: "Vision settings",
		ownerHref: "/workspace/settings/vision",
		runtimeSupported: true,
	},
	[Capability.ImageGeneration]: {
		label: "Image generation",
		ownerLabel: "v1.5 owner bead",
		runtimeSupported: false,
	},
	[Capability.DocumentsIngestion]: {
		label: "Documents ingestion",
		ownerLabel: "v1.5 owner bead",
		runtimeSupported: false,
	},
	[Capability.CompanyMemory]: {
		label: "Company memory",
		ownerLabel: "v1.5 owner bead",
		runtimeSupported: false,
	},
	[Capability.ToolCalling]: {
		label: "Tool calling",
		ownerLabel: "v1.5 owner bead",
		runtimeSupported: false,
	},
	[Capability.VoiceStt]: {
		label: "Voice STT",
		ownerLabel: "v1.5 owner bead",
		runtimeSupported: false,
	},
};

export default async function CapabilitySettingsPage() {
	const context = await resolveCapabilitiesContext();

	if (!context) {
		return <AuthRequiredPanel />;
	}

	const tenant = await prisma.tenant.findFirst({
		select: {
			capabilities: true,
			visionEnabled: true,
		},
		where: {
			id: context.tenantId,
			memberships: {
				some: { userId: context.userId },
			},
		},
	});

	if (!tenant) {
		return <AuthRequiredPanel />;
	}

	return (
		<CapabilityMatrixPanel
			rows={buildCapabilityRows(tenant, {
				env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
			})}
		/>
	);
}

export function CapabilityMatrixPanel({
	rows,
}: {
	rows: readonly CapabilityMatrixRow[];
}) {
	return (
		<article className="grid gap-5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
			<header className="grid gap-1">
				<p className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
					Capability matrix
				</p>
				<h2 className="m-0 text-lg font-semibold">Provider gates</h2>
				<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
					Current tenant capability state and provider mode.
				</p>
			</header>

			<div className="overflow-x-auto">
				<table className="w-full min-w-[52rem] border-collapse text-left text-sm">
					<thead>
						<tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-[0.08em] text-[var(--color-muted)]">
							<th className="px-3 py-2 font-medium">Capability</th>
							<th className="px-3 py-2 font-medium">State</th>
							<th className="px-3 py-2 font-medium">Provider mode</th>
							<th className="px-3 py-2 font-medium">Owner</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr
								className="border-b border-[var(--color-border)] last:border-b-0"
								key={row.capability}
							>
								<td className="px-3 py-3 align-top">
									<div className="grid gap-1">
										<span className="font-medium">{row.label}</span>
										<code className="text-xs text-[var(--color-muted)]">
											{row.capability}
										</code>
									</div>
								</td>
								<td className="px-3 py-3 align-top">
									<StateBadge state={row.state} />
								</td>
								<td className="px-3 py-3 align-top">
									<span className="text-[var(--color-text)]">
										{providerModeLabel(row.providerMode)}
									</span>
								</td>
								<td className="px-3 py-3 align-top">
									{row.ownerHref ? (
										<a
											className="text-[var(--color-accent)] underline underline-offset-4"
											href={row.ownerHref}
										>
											{row.ownerLabel}
										</a>
									) : (
										<span className="text-[var(--color-muted)]">
											{row.ownerLabel}
										</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</article>
	);
}

export function buildCapabilityRows(
	tenant: TenantCapabilityInput,
	options: CapabilityOptions = {},
): CapabilityMatrixRow[] {
	return ALL_CAPABILITIES.map((capability) => {
		const details = CAPABILITY_DETAILS[capability];
		const config = capabilityConfigForTenant(tenant, capability, options);
		const gate = requireCapability(tenant, capability, options);

		return {
			capability,
			label: details.label,
			state: details.runtimeSupported
				? gate.ok
					? "enabled"
					: "disabled"
				: "not_yet_supported",
			providerMode: config.provider_mode,
			ownerLabel: details.ownerLabel,
			ownerHref: details.ownerHref,
		};
	});
}

function AuthRequiredPanel() {
	return (
		<article className="grid gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
			<header className="grid gap-1">
				<p className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
					Capability matrix
				</p>
				<h2 className="m-0 text-lg font-semibold">Provider gates</h2>
			</header>
			<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
				Sign in to view tenant capability state.
			</p>
		</article>
	);
}

function StateBadge({ state }: { state: CapabilityMatrixRow["state"] }) {
	const label = state === "not_yet_supported" ? "Not yet supported" : state;

	return (
		<span
			className={[
				"inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
				stateClassName(state),
			].join(" ")}
		>
			{label}
		</span>
	);
}

function stateClassName(state: CapabilityMatrixRow["state"]): string {
	if (state === "enabled") {
		return "border-[var(--color-accent)] text-[var(--color-accent)]";
	}

	return "border-[var(--color-border)] text-[var(--color-muted)]";
}

function providerModeLabel(providerMode: ProviderMode): string {
	if (providerMode === ProviderMode.OpenaiDefault) {
		return "OpenAI default";
	}

	if (providerMode === ProviderMode.Byok) {
		return "BYOK";
	}

	if (providerMode === ProviderMode.LocalEndpoint) {
		return "Local endpoint";
	}

	return "Disabled";
}

async function resolveCapabilitiesContext(): Promise<{
	tenantId: string;
	userId: string;
} | null> {
	const session = await resolveServerSession();

	if (!session) {
		return null;
	}

	return {
		tenantId: session.tenantId,
		userId: session.userId,
	};
}

export function isValidCapabilitySettingsUuid(
	value: string | null | undefined,
): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
