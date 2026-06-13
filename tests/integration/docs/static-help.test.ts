import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import test from "node:test";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !specifier.startsWith(".")) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}.tsx`, context.parentURL),
			new URL(`${specifier}.json`, context.parentURL),
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) => existsSync(candidate));

		if (resolved) {
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
});

const {
	HELP_DOC_TOPICS,
	buildHelpPageModel,
	listHelpDocs,
	resolveHelpLocale,
	searchHelpDocs,
	selectHelpDoc,
} = await import("../../../src/lib/docs");
const { LOCALES } = await import("../../../src/lib/i18n/types");
type HelpDocument = Awaited<
	ReturnType<typeof import("../../../src/lib/docs").listHelpDocs>
>[number];

const docsRoot = join(process.cwd(), "src/content/docs");
const forbiddenFrames = ["FK", "Buddhist", "Bradley", "Safety-II"];

test("static help docs have topic and locale parity", () => {
	const files = readdirSync(docsRoot).filter((fileName) => fileName.endsWith(".md"));
	const slugs = files.map((fileName) => fileName.replace(/\.md$/, "")).sort();

	assert.deepEqual(slugs, [...HELP_DOC_TOPICS].sort());

	for (const locale of LOCALES) {
		const docs = listHelpDocs(locale);
		assert.deepEqual(
			docs.map((doc) => doc.slug).sort(),
			[...HELP_DOC_TOPICS].sort(),
		);
	}
});

test("each help doc has required sections and valid see-also links", () => {
	const slugs = new Set(HELP_DOC_TOPICS);

	for (const locale of LOCALES) {
		for (const doc of listHelpDocs(locale)) {
			assertDocComplete(doc);
			for (const linkedSlug of doc.seeAlso) {
				assert.ok(slugs.has(linkedSlug), `${doc.slug} links to ${linkedSlug}`);
			}
		}
	}
});

test("workflow and capability coverage is represented", () => {
	const docs = listHelpDocs("en");
	const coverage = new Set(docs.map((doc) => doc.coverage));

	for (const expected of [
		"HIRA",
		"JHA",
		"II",
		"actions",
		"SDS",
		"findings",
		"toolbox",
		"exports",
		"privacy",
	]) {
		assert.ok(coverage.has(expected), `missing coverage for ${expected}`);
	}
});

test("search returns workflow and privacy matches in the selected locale", () => {
	assert.equal(searchHelpDocs("en", "incident photos")[0]?.slug, "incident-investigation");
	assert.equal(searchHelpDocs("en", "cloud vision")[0]?.slug, "privacy");
	assert.equal(searchHelpDocs("de", "risiko")[0]?.locale, "de");
});

test("route selection defaults to the first search result when no topic is selected", () => {
	assert.equal(selectHelpDoc("en", "incident photos", null)?.slug, "incident-investigation");
	assert.equal(selectHelpDoc("en", "cloud vision", undefined)?.slug, "privacy");
	assert.equal(selectHelpDoc("en", "incident photos", "actions")?.slug, "actions");
	assert.equal(
		buildHelpPageModel({ explicitLocale: "en", query: "incident photos" }).selectedDoc?.slug,
		"incident-investigation",
	);
});

test("route locale follows explicit, persisted, then Accept-Language order", () => {
	assert.equal(
		resolveHelpLocale({ explicitLocale: "it", persistedLocale: "de" }),
		"it",
	);
	assert.equal(resolveHelpLocale({ persistedLocale: "fr" }), "fr");
	assert.equal(
		resolveHelpLocale({ acceptLanguageHeader: "de-CH,de;q=0.9" }),
		"de",
	);
});

test("help prose avoids explicitly forbidden frames", () => {
	for (const fileName of readdirSync(docsRoot).filter((file) => file.endsWith(".md"))) {
		const raw = readFileSync(join(docsRoot, fileName), "utf8");
		for (const forbidden of forbiddenFrames) {
			assert.equal(raw.includes(forbidden), false, `${fileName} contains ${forbidden}`);
		}
	}
});

function assertDocComplete(doc: HelpDocument) {
	assert.ok(doc.title.length > 0, `${doc.slug} has title`);
	assert.ok(doc.audience.length > 0, `${doc.slug} has audience`);
	assert.ok(doc.summary.length > 0, `${doc.slug} has summary`);
	assert.ok(doc.howTo.length > 0, `${doc.slug} has how-to steps`);
	assert.ok(doc.seeAlso.length > 0, `${doc.slug} has see-also links`);
	assert.ok(doc.body.length > 0, `${doc.slug} has body`);
}
