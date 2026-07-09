import Link from "next/link";
import LanguageDropdown from "../../components/ui/LanguageDropdown";
import { resolveLocaleContext } from "../../lib/auth/locale-server";
import type { Locale } from "../../lib/i18n/types";
import { exploredPercent } from "../../lib/process-map/canvas";
import { listProcessMaps, loadProcessMap } from "../../lib/process-map";
import { computeProcessMapReadiness } from "../../lib/process-map/readiness";

type ProcessMapListRow = {
	id: string;
	title: string;
	exploredPercent: number;
	updatedAt: Date;
};

export default async function ProcessMapsPage() {
	const { locale, session } = await resolveLocaleContext();

	if (!session) {
		return (
			<ProcessMapsShell locale={locale} title="Process maps">
				<p className="m-0 text-sm text-[var(--color-muted)]">
					Sign in to view process maps.
				</p>
			</ProcessMapsShell>
		);
	}

	const maps = await loadProcessMapList(session.tenantId);

	return (
		<ProcessMapsShell
			description="Open generated process maps for the current company."
			locale={locale}
			title="Process maps"
		>
			{maps.length === 0 ? (
				<section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
					<p className="m-0 text-sm text-[var(--color-muted)]">
						No process maps yet.
					</p>
				</section>
			) : (
				<section className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
					<div className="overflow-x-auto">
						<table className="w-full border-separate border-spacing-0 text-left text-sm">
							<thead>
								<tr className="text-[var(--color-muted)]">
									<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium">
										Title
									</th>
									<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium">
										Explored
									</th>
									<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium">
										Updated
									</th>
								</tr>
							</thead>
							<tbody>
								{maps.map((map) => (
									<tr
										className="transition-colors hover:bg-[var(--color-surface-elev)]"
										key={map.id}
									>
										<td className="border-b border-[var(--color-border)] px-3 py-2">
											<Link
												className="font-medium text-[var(--color-text)] underline-offset-4 hover:underline"
												href={`/process-maps/${map.id}`}
											>
												{map.title}
											</Link>
										</td>
										<td className="border-b border-[var(--color-border)] px-3 py-2">
											<span className="inline-flex rounded-full border border-[var(--color-accent)] px-2 py-0.5 text-xs text-[var(--color-accent)]">
												{map.exploredPercent}% explored
											</span>
										</td>
										<td className="whitespace-nowrap border-b border-[var(--color-border)] px-3 py-2 text-[var(--color-muted)]">
											{formatDate(map.updatedAt, locale)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			)}
		</ProcessMapsShell>
	);
}

async function loadProcessMapList(
	tenantId: string,
): Promise<ProcessMapListRow[]> {
	const maps = await listProcessMaps(tenantId);
	const rows = await Promise.all(
		maps.map(async (map) => {
			const record = await loadProcessMap(tenantId, map.id);
			const readiness = record
				? computeProcessMapReadiness(record)
				: {
						questLog: {
							clearCount: 0,
							fogCount: 0,
							hazeCount: 0,
							quests: [],
						},
					};

			return {
				exploredPercent: exploredPercent(readiness.questLog),
				id: map.id,
				title: map.title,
				updatedAt: map.updatedAt,
			};
		}),
	);

	return rows;
}

function ProcessMapsShell({
	children,
	description,
	locale,
	title,
}: {
	children: React.ReactNode;
	description?: string;
	locale: Locale;
	title: string;
}) {
	return (
		<main className="min-h-screen bg-[var(--color-bg)] px-4 py-5 text-[var(--color-text)] lg:px-6">
			<div className="mx-auto grid w-full max-w-6xl gap-5">
				<nav className="flex items-center justify-between gap-2 text-sm text-[var(--color-muted)]">
					<Link className="hover:text-[var(--color-text)]" href="/workspace">
						Workspace
					</Link>
					<LanguageDropdown
						ariaLabel="Language"
						locale={locale}
					/>
				</nav>
				<header className="grid gap-2">
					<h1 className="m-0 text-xl font-semibold">{title}</h1>
					{description ? (
						<p className="m-0 max-w-3xl text-sm text-[var(--color-muted)]">
							{description}
						</p>
					) : null}
				</header>
				{children}
			</div>
		</main>
	);
}

function formatDate(value: Date, locale: Locale): string {
	return new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(value);
}
