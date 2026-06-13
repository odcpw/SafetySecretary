import Link from "next/link";
import { resolveServerSession } from "../../../../lib/auth/route-session";
import { prisma } from "../../../../lib/db";
import { t } from "../../../../lib/i18n/t";
import {
	DEFAULT_LOCALE,
	type Locale,
	type MessageKey,
} from "../../../../lib/i18n/types";
import { DeleteCompanyButton } from "./DeleteCompanyButton";

type CompanyDeleteContext = {
	locale: Locale;
	tenantName: string;
};

const confirmationValue = "DELETE";

export default async function DeleteCompanyPage() {
	const context = await resolveCompanyDeleteContext();
	const locale = context?.locale ?? DEFAULT_LOCALE;

	return (
		<main className="min-h-screen bg-[var(--color-bg)] px-4 py-5 text-[var(--color-text)] lg:px-6">
			<div className="mx-auto grid w-full max-w-3xl gap-5">
				<nav className="flex flex-wrap gap-2 text-sm text-[var(--color-muted)]">
					<Link className="hover:text-[var(--color-text)]" href="/workspace">
						{tr(messageKey("company", "delete", "workspace"), locale)}
					</Link>
					<Link
						className="hover:text-[var(--color-text)]"
						href="/workspace/settings/danger-zone"
					>
						{tr(messageKey("company", "delete", "dangerZone"), locale)}
					</Link>
				</nav>
				<article className="grid gap-5 rounded-md border border-[var(--color-danger)] bg-[var(--color-surface)] p-5">
					<header className="grid gap-2">
						<h1 className="m-0 text-xl font-semibold">
							{tr(messageKey("company", "delete", "title"), locale)}
						</h1>
						<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
							{context
								? `${context.tenantName} · ${tr(
										messageKey("company", "delete", "description"),
										locale,
									)}`
								: tr(messageKey("company", "delete", "authRequired"), locale)}
						</p>
					</header>
					{context ? (
						<>
							<p className="m-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] p-3 text-sm text-[var(--color-muted)]">
								{tr(
									messageKey("company", "delete", "confirmationHint"),
									locale,
								)}
							</p>
							<DeleteCompanyButton
								confirmationLabel={tr(
									messageKey("company", "delete", "confirmationLabel"),
									locale,
								)}
								confirmationValue={confirmationValue}
								errorLabel={tr(
									messageKey("company", "delete", "error"),
									locale,
								)}
								pendingLabel={tr(
									messageKey("company", "delete", "pending"),
									locale,
								)}
								submitLabel={tr(
									messageKey("company", "delete", "submit"),
									locale,
								)}
							/>
						</>
					) : null}
				</article>
			</div>
		</main>
	);
}

async function resolveCompanyDeleteContext(): Promise<CompanyDeleteContext | null> {
	const session = await resolveServerSession();

	if (!session) {
		return null;
	}

	const [user, tenant] = await Promise.all([
		prisma.user.findUnique({
			select: { uiLocale: true },
			where: { id: session.userId },
		}),
		prisma.tenant.findUnique({
			select: { name: true },
			where: { id: session.tenantId },
		}),
	]);

	if (!tenant) {
		return null;
	}

	return {
		locale: user?.uiLocale ?? DEFAULT_LOCALE,
		tenantName: tenant.name,
	};
}

function tr(key: MessageKey, locale: Locale): string {
	return t(key, locale);
}

function messageKey(...parts: string[]): MessageKey {
	return parts.join(".") as MessageKey;
}
