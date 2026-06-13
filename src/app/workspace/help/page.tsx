import Link from "next/link";
import { headers } from "next/headers";
import { resolveServerSession } from "../../../lib/auth/route-session";
import {
	type HelpDocSlug,
	buildHelpPageModel,
	getHelpDoc,
	isHelpDocSlug,
} from "../../../lib/docs";
import { prisma } from "../../../lib/db";
import { t } from "../../../lib/i18n/t";
import type { Locale } from "../../../lib/i18n/types";

type HelpPageProps = {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HelpPage({ searchParams }: HelpPageProps) {
	const params = await searchParams;
	const requestHeaders = await headers();
	const persistedLocale = await persistedUserLocale();
	const selectedSlug = parseSlug(firstParam(params?.topic));
	const { locale, query, results, selectedDoc } = buildHelpPageModel({
		acceptLanguageHeader: requestHeaders.get("accept-language"),
		explicitLocale: firstParam(params?.locale),
		persistedLocale,
		query: firstParam(params?.q),
		selectedSlug,
	});

	return (
		<main className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-4 py-8 text-[var(--color-text)] md:grid-cols-[18rem_1fr]">
			<aside className="grid content-start gap-4">
				<form action="/workspace/help" className="grid gap-2">
					<input name="locale" type="hidden" value={locale} />
					<input
						aria-label={t("common.search", locale)}
						className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
						defaultValue={query}
						name="q"
						placeholder={t("common.search", locale)}
						type="search"
					/>
					<button
						className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)]"
						type="submit"
					>
						{t("common.search", locale)}
					</button>
				</form>

				<nav className="grid gap-2">
					{results.map((doc) => (
						<Link
							className={[
								"rounded-md border px-3 py-2 text-sm",
								doc.slug === selectedDoc?.slug
									? "border-[var(--color-accent)] bg-[var(--color-surface)]"
									: "border-[var(--color-border)]",
							].join(" ")}
							href={`/workspace/help?locale=${locale}&topic=${doc.slug}`}
							key={doc.slug}
						>
							<span className="block font-medium">{doc.title}</span>
							<span className="block text-xs text-[var(--color-muted)]">
								{doc.summary}
							</span>
						</Link>
					))}
				</nav>
			</aside>

			{selectedDoc ? (
				<article className="grid content-start gap-5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
					<header className="grid gap-2">
						<p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
							{selectedDoc.audience}
						</p>
						<h1 className="m-0 text-2xl font-semibold">{selectedDoc.title}</h1>
						<p className="m-0 text-sm text-[var(--color-muted)]">
							{selectedDoc.summary}
						</p>
					</header>

					<ol className="grid gap-2 pl-5 text-sm">
						{selectedDoc.howTo.map((step) => (
							<li key={step}>{step}</li>
						))}
					</ol>

					<div className="whitespace-pre-wrap text-sm leading-6">
						{selectedDoc.body}
					</div>

					<div className="flex flex-wrap gap-2">
						{selectedDoc.seeAlso.map((slug) => {
							const linkedDoc = getHelpDoc(locale, slug);

							return linkedDoc ? (
								<Link
									className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs"
									href={`/workspace/help?locale=${locale}&topic=${slug}`}
									key={slug}
								>
									{linkedDoc.title}
								</Link>
							) : null;
						})}
					</div>
				</article>
			) : null}
		</main>
	);
}

function firstParam(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

async function persistedUserLocale(): Promise<Locale | null> {
	const session = await resolveServerSession();

	if (!session) {
		return null;
	}

	const user = await prisma.user.findUnique({
		select: { uiLocale: true },
		where: { id: session.userId },
	});

	return user?.uiLocale ?? null;
}

function parseSlug(value: string | undefined): HelpDocSlug | null {
	return value && isHelpDocSlug(value) ? value : null;
}
