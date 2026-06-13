import { resolveServerSession } from "../../../../lib/auth/route-session";
import { prisma } from "../../../../lib/db";
import { t } from "../../../../lib/i18n/t";
import {
	DEFAULT_LOCALE,
	type Locale,
	type MessageKey,
} from "../../../../lib/i18n/types";
import { RemoveMemberButton } from "./RemoveMemberButton";

type MemberRow = {
	createdAt: Date;
	email: string;
	uiLocale: Locale | null;
	userId: string;
};

export default async function MembersSettingsPage() {
	const context = await resolveMembersContext();

	if (!context) {
		return (
			<MembersPanel locale={DEFAULT_LOCALE}>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{tr(
						messageKey("settings", "members", "authRequired"),
						DEFAULT_LOCALE,
					)}
				</p>
			</MembersPanel>
		);
	}

	const members = await loadMembers(context.tenantId);

	return (
		<MembersPanel locale={context.locale}>
			{members.length === 0 ? (
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{tr(messageKey("settings", "members", "empty"), context.locale)}
				</p>
			) : (
				<div className="overflow-hidden rounded-md border border-[var(--color-border)]">
					<table className="w-full border-separate border-spacing-0 text-left text-sm">
						<thead>
							<tr className="text-[var(--color-muted)]">
								<TableHeader
									labelKey="settings.members.email"
									locale={context.locale}
								/>
								<TableHeader
									labelKey="settings.members.uiLocale"
									locale={context.locale}
								/>
								<TableHeader
									labelKey="settings.members.joinedAt"
									locale={context.locale}
								/>
								<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium" />
							</tr>
						</thead>
						<tbody>
							{members.map((member) => (
								<tr
									className="transition-colors hover:bg-[var(--color-surface-elev)]"
									key={member.userId}
								>
									<td className="border-b border-[var(--color-border)] px-3 py-2">
										<div className="grid gap-1">
											<span className="font-medium text-[var(--color-text)]">
												{member.email}
											</span>
											{member.userId === context.userId ? (
												<span className="text-xs text-[var(--color-muted)]">
													{tr(
														messageKey("settings", "members", "currentUser"),
														context.locale,
													)}
												</span>
											) : null}
										</div>
									</td>
									<td className="border-b border-[var(--color-border)] px-3 py-2 text-[var(--color-muted)]">
										{member.uiLocale?.toUpperCase() ?? "-"}
									</td>
									<td className="border-b border-[var(--color-border)] px-3 py-2 text-[var(--color-muted)]">
										{formatDate(member.createdAt, context.locale)}
									</td>
									<td className="border-b border-[var(--color-border)] px-3 py-2 text-right">
										<RemoveMemberButton
											errorLabel={tr(
												messageKey("settings", "members", "removeError"),
												context.locale,
											)}
											label={tr(
												member.userId === context.userId
													? messageKey("settings", "members", "removeSelf")
													: messageKey("settings", "members", "remove"),
												context.locale,
											)}
											memberId={member.userId}
											pendingLabel={tr(
												messageKey("settings", "members", "removing"),
												context.locale,
											)}
										/>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</MembersPanel>
	);
}

function MembersPanel({
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
					{tr(messageKey("settings", "members", "eyebrow"), locale)}
				</p>
				<h2 className="m-0 text-lg font-semibold">
					{tr(messageKey("settings", "members", "title"), locale)}
				</h2>
				<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
					{tr(messageKey("settings", "members", "description"), locale)}
				</p>
			</header>
			{children}
		</article>
	);
}

function TableHeader({
	labelKey,
	locale,
}: {
	labelKey: MessageKey;
	locale: Locale;
}) {
	return (
		<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium">
			{tr(labelKey, locale)}
		</th>
	);
}

async function loadMembers(tenantId: string): Promise<MemberRow[]> {
	const memberships = await prisma.tenantMembership.findMany({
		orderBy: { createdAt: "asc" },
		select: {
			createdAt: true,
			user: {
				select: {
					email: true,
					id: true,
					uiLocale: true,
				},
			},
		},
		where: { tenantId },
	});

	return memberships.map((membership) => ({
		createdAt: membership.createdAt,
		email: membership.user.email,
		uiLocale: membership.user.uiLocale,
		userId: membership.user.id,
	}));
}

async function resolveMembersContext(): Promise<{
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

function formatDate(value: Date, locale: Locale): string {
	return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(value);
}

function tr(key: MessageKey, locale: Locale): string {
	return t(key, locale);
}

function messageKey(...parts: string[]): MessageKey {
	return parts.join(".") as MessageKey;
}
