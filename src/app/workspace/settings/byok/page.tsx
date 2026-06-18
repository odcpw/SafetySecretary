import { revalidatePath } from "next/cache";
import { resolveServerSession } from "../../../../lib/auth/route-session";
import { prisma } from "../../../../lib/db";
import {
	clearByokProviderConfig,
	clearLocalOverrideConfig,
	readByokSettings,
	saveByokProviderConfig,
	saveLocalOverrideConfig,
	type ByokSettingsState,
} from "../../../../lib/llm/byok";
import { t } from "../../../../lib/i18n/t";
import {
	DEFAULT_LOCALE,
	type Locale,
	type MessageKey,
} from "../../../../lib/i18n/types";

export default async function ByokSettingsPage() {
	const context = await resolveByokContext();

	if (!context) {
		return (
			<ByokPanel locale={DEFAULT_LOCALE}>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{t(messageKey("settings", "byok", "authRequired"), DEFAULT_LOCALE)}
				</p>
			</ByokPanel>
		);
	}

	const state = await readByokSettings(
		{ tenantId: context.tenantId, userId: context.userId },
		{ prisma },
	);

	return (
		<ByokPanel locale={context.locale}>
			<ByokStatus locale={context.locale} state={state} />
			<div className="grid gap-4 lg:grid-cols-2">
				<ByokForm locale={context.locale} state={state} />
				<LocalOverrideForm locale={context.locale} state={state} />
			</div>
		</ByokPanel>
	);
}

function ByokPanel({
	children,
	locale,
}: {
	children: React.ReactNode;
	locale: Locale;
}) {
	return (
		<article className="grid gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
			<header className="grid gap-1">
				<p className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
					{t(messageKey("settings", "byok", "eyebrow"), locale)}
				</p>
				<h2 className="m-0 text-lg font-semibold">
					{t(messageKey("settings", "byok", "title"), locale)}
				</h2>
				<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
					{t(messageKey("settings", "byok", "description"), locale)}
				</p>
			</header>
			{children}
		</article>
	);
}

function ByokStatus({
	locale,
	state,
}: {
	locale: Locale;
	state: ByokSettingsState | null;
}) {
	return (
		<section className="grid gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] p-3 text-sm">
			<p className="m-0 font-medium">
				{t(messageKey("settings", "byok", "statusTitle"), locale)}
			</p>
			<p className="m-0 text-[var(--color-muted)]">
				{state?.maskedIndicator ??
					t(messageKey("settings", "byok", "noKey"), locale)}
			</p>
			<p className="m-0 text-[var(--color-muted)]">
				{state?.localOverrideConfig
					? `${t(messageKey("settings", "byok", "localEndpoint"), locale)} ${state.localOverrideConfig.baseUrl} (${state.localOverrideConfig.textModel})`
					: t(messageKey("settings", "byok", "noLocalOverride"), locale)}
			</p>
		</section>
	);
}

function ByokForm({
	locale,
	state,
}: {
	locale: Locale;
	state: ByokSettingsState | null;
}) {
	return (
		<section className="grid content-start gap-3 rounded-md border border-[var(--color-border)] p-4">
			<header className="grid gap-1">
				<h3 className="m-0 text-base font-semibold">
					{t(messageKey("settings", "byok", "keyTitle"), locale)}
				</h3>
				<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
					{t(messageKey("settings", "byok", "keyDescription"), locale)}
				</p>
			</header>
			<form action={saveByokAction} className="grid gap-3">
				<label className="grid gap-1 text-sm">
					<span className="font-medium">
						{t(messageKey("settings", "byok", "apiKey"), locale)}
					</span>
					<input
						autoComplete="off"
						className="min-h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
						name="apiKey"
						required
						type="password"
					/>
				</label>
				<label className="grid gap-1 text-sm">
					<span className="font-medium">
						{t(messageKey("settings", "byok", "baseUrl"), locale)}
					</span>
					<input
						className="min-h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
						defaultValue="https://api.openai.com/v1"
						name="baseUrl"
						required
						type="url"
					/>
				</label>
				<div className="grid gap-3 sm:grid-cols-2">
					<ModelInput
						defaultValue="gpt-5.5"
						label={t(messageKey("settings", "byok", "textModel"), locale)}
						name="textModel"
					/>
					<ModelInput
						defaultValue="gpt-4o-mini"
						label={t(messageKey("settings", "byok", "visionModel"), locale)}
						name="visionModel"
					/>
				</div>
				<button
					className="inline-flex min-h-10 w-fit items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2 text-sm font-medium"
					type="submit"
				>
					{t(messageKey("settings", "byok", "saveByok"), locale)}
				</button>
			</form>
			<form action={clearByokAction}>
				<button
					className="inline-flex min-h-10 w-fit items-center justify-center rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium disabled:opacity-50"
					disabled={!state?.hasByokProviderConfig}
					type="submit"
				>
					{t(messageKey("settings", "byok", "clearByok"), locale)}
				</button>
			</form>
		</section>
	);
}

function LocalOverrideForm({
	locale,
	state,
}: {
	locale: Locale;
	state: ByokSettingsState | null;
}) {
	return (
		<section className="grid content-start gap-3 rounded-md border border-[var(--color-border)] p-4">
			<header className="grid gap-1">
				<h3 className="m-0 text-base font-semibold">
					{t(messageKey("settings", "byok", "localOverrideTitle"), locale)}
				</h3>
				<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
					{t(
						messageKey("settings", "byok", "localOverrideDescription"),
						locale,
					)}
				</p>
			</header>
			<form action={saveLocalOverrideAction} className="grid gap-3">
				<label className="grid gap-1 text-sm">
					<span className="font-medium">
						{t(messageKey("settings", "byok", "baseUrl"), locale)}
					</span>
					<input
						className="min-h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
						defaultValue={state?.localOverrideConfig?.baseUrl ?? ""}
						name="baseUrl"
						placeholder="http://localhost:11434/v1"
						required
						type="url"
					/>
				</label>
				<label className="grid gap-1 text-sm">
					<span className="font-medium">
						{t(messageKey("settings", "byok", "apiKeyOrPlaceholder"), locale)}
					</span>
					<input
						autoComplete="off"
						className="min-h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
						defaultValue={state?.localOverrideConfig?.apiKey ?? ""}
						name="apiKey"
						type="text"
					/>
				</label>
				<div className="grid gap-3 sm:grid-cols-2">
					<ModelInput
						defaultValue={state?.localOverrideConfig?.textModel ?? ""}
						label={t(messageKey("settings", "byok", "textModel"), locale)}
						name="textModel"
					/>
					<ModelInput
						defaultValue={state?.localOverrideConfig?.visionModel ?? ""}
						label={t(messageKey("settings", "byok", "visionModel"), locale)}
						name="visionModel"
					/>
				</div>
				<button
					className="inline-flex min-h-10 w-fit items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2 text-sm font-medium"
					type="submit"
				>
					{t(messageKey("settings", "byok", "saveLocalOverride"), locale)}
				</button>
			</form>
			<form action={clearLocalOverrideAction}>
				<button
					className="inline-flex min-h-10 w-fit items-center justify-center rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium disabled:opacity-50"
					disabled={!state?.localOverrideConfig}
					type="submit"
				>
					{t(messageKey("settings", "byok", "clearLocalOverride"), locale)}
				</button>
			</form>
		</section>
	);
}

function ModelInput({
	defaultValue,
	label,
	name,
}: {
	defaultValue: string;
	label: string;
	name: string;
}) {
	return (
		<label className="grid gap-1 text-sm">
			<span className="font-medium">{label}</span>
			<input
				className="min-h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
				defaultValue={defaultValue}
				name={name}
				required
				type="text"
			/>
		</label>
	);
}

async function saveByokAction(formData: FormData) {
	"use server";

	const context = await resolveByokContext();
	if (!context) {
		return;
	}

	await saveByokProviderConfig(
		{
			tenantId: context.tenantId,
			userId: context.userId,
			config: {
				apiKey: formString(formData, "apiKey"),
				baseUrl: formString(formData, "baseUrl"),
				textModel: formString(formData, "textModel"),
				visionModel: formString(formData, "visionModel"),
			},
		},
		{ prisma },
	);
	revalidatePath("/workspace/settings/byok");
}

async function clearByokAction() {
	"use server";

	const context = await resolveByokContext();
	if (!context) {
		return;
	}

	await clearByokProviderConfig(
		{ tenantId: context.tenantId, userId: context.userId },
		{ prisma },
	);
	revalidatePath("/workspace/settings/byok");
}

async function saveLocalOverrideAction(formData: FormData) {
	"use server";

	const context = await resolveByokContext();
	if (!context) {
		return;
	}

	await saveLocalOverrideConfig(
		{
			tenantId: context.tenantId,
			userId: context.userId,
			config: {
				apiKey: formString(formData, "apiKey") || undefined,
				baseUrl: formString(formData, "baseUrl"),
				textModel: formString(formData, "textModel"),
				visionModel: formString(formData, "visionModel"),
			},
		},
		{ prisma },
	);
	revalidatePath("/workspace/settings/byok");
}

async function clearLocalOverrideAction() {
	"use server";

	const context = await resolveByokContext();
	if (!context) {
		return;
	}

	await clearLocalOverrideConfig(
		{ tenantId: context.tenantId, userId: context.userId },
		{ prisma },
	);
	revalidatePath("/workspace/settings/byok");
}

async function resolveByokContext(): Promise<{
	locale: Locale;
	tenantId: string;
	userId: string;
} | null> {
	const session = await resolveServerSession();

	if (!session) {
		return null;
	}

	const user = await prisma.user.findUnique({
		select: { uiLocale: true },
		where: { id: session.userId },
	});

	return {
		locale: user?.uiLocale ?? DEFAULT_LOCALE,
		tenantId: session.tenantId,
		userId: session.userId,
	};
}

function formString(formData: FormData, name: string): string {
	const value = formData.get(name);
	return typeof value === "string" ? value.trim() : "";
}

function messageKey(...parts: string[]): MessageKey {
	return parts.join(".") as MessageKey;
}
