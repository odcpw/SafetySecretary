import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pickInitialUiLocale } from "../auth/locale";
import type { Locale } from "../i18n/types";
import { LOCALES } from "../i18n/types";

export const HELP_DOC_TOPICS = [
	"hira",
	"jha",
	"incident-investigation",
	"actions",
	"sds",
	"findings",
	"toolbox-talk",
	"exports",
	"capability-matrix",
	"memory-notebook",
	"agent-boundaries",
	"privacy",
	"self-host",
	"faq",
] as const;

export type HelpDocSlug = (typeof HELP_DOC_TOPICS)[number];

export type HelpDocument = {
	slug: HelpDocSlug;
	category: string;
	coverage: string;
	locale: Locale;
	title: string;
	audience: string;
	summary: string;
	howTo: string[];
	seeAlso: HelpDocSlug[];
	body: string;
};

export type HelpSearchResult = HelpDocument & {
	score: number;
};

export type HelpPageModel = {
	locale: Locale;
	query: string;
	results: HelpSearchResult[];
	selectedDoc: HelpDocument | null;
	selectedSlug: HelpDocSlug | null;
};

const docsRoot = join(process.cwd(), "src/content/docs");
const localePattern = /## (de|en|fr|it)\n([\s\S]*?)(?=\n## (?:de|en|fr|it)\n|$)/g;

const helpDocCache = new Map<Locale, HelpDocument[]>();

export function listHelpDocs(locale: Locale): HelpDocument[] {
	const cached = helpDocCache.get(locale);

	if (cached) {
		return cached;
	}

	const docs = readdirSync(docsRoot)
		.filter((fileName) => fileName.endsWith(".md"))
		.sort()
		.map((fileName) => parseHelpDocFile(fileName, locale));

	helpDocCache.set(locale, docs);
	return docs;
}

export function getHelpDoc(
	locale: Locale,
	slug: HelpDocSlug,
): HelpDocument | null {
	return listHelpDocs(locale).find((doc) => doc.slug === slug) ?? null;
}

export function searchHelpDocs(
	locale: Locale,
	query: string,
): HelpSearchResult[] {
	const terms = query
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);

	if (terms.length === 0) {
		return listHelpDocs(locale).map((doc) => ({ ...doc, score: 0 }));
	}

	return listHelpDocs(locale)
		.map((doc) => ({ ...doc, score: scoreHelpDoc(doc, terms) }))
		.filter((doc) => doc.score > 0)
		.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
}

export function isHelpDocSlug(value: string): value is HelpDocSlug {
	return (HELP_DOC_TOPICS as readonly string[]).includes(value);
}

export function selectHelpDoc(
	locale: Locale,
	query: string,
	selectedSlug?: HelpDocSlug | null,
): HelpDocument | null {
	const docs = listHelpDocs(locale);
	const results = query ? searchHelpDocs(locale, query) : docs.map((doc) => ({ ...doc, score: 0 }));

	if (selectedSlug) {
		return docs.find((doc) => doc.slug === selectedSlug) ?? results[0] ?? null;
	}

	return results[0] ?? docs[0] ?? null;
}

export function buildHelpPageModel(input: {
	acceptLanguageHeader?: string | null;
	explicitLocale?: string | null;
	persistedLocale?: Locale | null;
	query?: string | null;
	selectedSlug?: HelpDocSlug | null;
}): HelpPageModel {
	const locale = resolveHelpLocale(input);
	const query = input.query ?? "";
	const results = query
		? searchHelpDocs(locale, query)
		: listHelpDocs(locale).map((doc) => ({ ...doc, score: 0 }));
	const selectedDoc = input.selectedSlug
		? listHelpDocs(locale).find((doc) => doc.slug === input.selectedSlug) ?? results[0] ?? null
		: results[0] ?? null;

	return {
		locale,
		query,
		results,
		selectedDoc,
		selectedSlug: input.selectedSlug ?? null,
	};
}

export function resolveHelpLocale(input: {
	acceptLanguageHeader?: string | null;
	explicitLocale?: string | null;
	persistedLocale?: Locale | null;
}): Locale {
	if (LOCALES.includes(input.explicitLocale as Locale)) {
		return input.explicitLocale as Locale;
	}

	if (input.persistedLocale) {
		return input.persistedLocale;
	}

	return pickInitialUiLocale(input.acceptLanguageHeader, "en");
}

function parseHelpDocFile(fileName: string, locale: Locale): HelpDocument {
	const raw = readFileSync(join(docsRoot, fileName), "utf8");
	const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);

	if (!frontmatterMatch) {
		throw new Error(`Missing frontmatter in ${fileName}`);
	}

	const frontmatter = parseFrontmatter(frontmatterMatch[1]);
	const slug = frontmatter.slug;

	if (!isHelpDocSlug(slug)) {
		throw new Error(`Unknown help doc slug ${slug} in ${fileName}`);
	}

	const block = localeBlock(raw.slice(frontmatterMatch[0].length), locale, fileName);
	const fields = parseLocaleFields(block, fileName, locale);

	return {
		slug,
		category: frontmatter.category ?? "",
		coverage: frontmatter.coverage ?? "",
		locale,
		...fields,
	};
}

function parseFrontmatter(raw: string): Record<string, string> {
	return Object.fromEntries(
		raw
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [key, ...valueParts] = line.split(":");
				return [key.trim(), valueParts.join(":").trim()];
			}),
	);
}

function localeBlock(raw: string, locale: Locale, fileName: string): string {
	for (const match of raw.matchAll(localePattern)) {
		if (match[1] === locale) {
			return match[2].trim();
		}
	}

	throw new Error(`Missing ${locale} block in ${fileName}`);
}

function parseLocaleFields(
	block: string,
	fileName: string,
	locale: Locale,
): Omit<HelpDocument, "slug" | "category" | "coverage" | "locale"> {
	const lines = block.split("\n");
	const title = requiredField(lines, "Title", fileName, locale);
	const audience = requiredField(lines, "Audience", fileName, locale);
	const summary = requiredField(lines, "Summary", fileName, locale);
	const seeAlso = requiredField(lines, "See also", fileName, locale)
		.split(",")
		.map((slug) => slug.trim())
		.filter(Boolean);
	const howTo = listAfter(lines, "How to");
	const body = bodyAfter(lines);

	const unknownLinks = seeAlso.filter((slug) => !isHelpDocSlug(slug));
	if (unknownLinks.length > 0) {
		throw new Error(`Unknown see-also link in ${fileName}: ${unknownLinks.join(", ")}`);
	}

	return {
		title,
		audience,
		summary,
		howTo,
		seeAlso: seeAlso as HelpDocSlug[],
		body,
	};
}

function requiredField(
	lines: string[],
	fieldName: string,
	fileName: string,
	locale: Locale,
): string {
	const prefix = `${fieldName}:`;
	const line = lines.find((candidate) => candidate.startsWith(prefix));
	const value = line?.slice(prefix.length).trim();

	if (!value) {
		throw new Error(`Missing ${fieldName} in ${fileName} ${locale}`);
	}

	return value;
}

function listAfter(lines: string[], fieldName: string): string[] {
	const start = lines.findIndex((line) => line.trim() === `${fieldName}:`);

	if (start === -1) {
		return [];
	}

	const items: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (line.startsWith("- ")) {
			items.push(line.slice(2).trim());
			continue;
		}

		if (items.length > 0) {
			break;
		}
	}

	return items;
}

function bodyAfter(lines: string[]): string {
	const bodyIndex = lines.findIndex((line) => line.trim() === "Body:");

	if (bodyIndex === -1) {
		return "";
	}

	return lines.slice(bodyIndex + 1).join("\n").trim();
}

function scoreHelpDoc(doc: HelpDocument, terms: string[]): number {
	const primaryText = [doc.slug, doc.title, doc.coverage].join(" ").toLowerCase();
	const searchable = [
		doc.title,
		doc.audience,
		doc.summary,
		doc.body,
		doc.coverage,
		...doc.howTo,
	].join(" ").toLowerCase();

	return terms.reduce(
		(score, term) =>
			score +
			(primaryText.includes(term) ? 3 : 0) +
			(searchable.includes(term) ? 1 : 0),
		0,
	);
}
