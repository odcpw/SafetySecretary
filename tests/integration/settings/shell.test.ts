import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { NextRequest as NextRequestType } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "next/navigation") {
			return {
				shortCircuit: true,
				url: pathToFileURL(path.resolve("node_modules/next/navigation.js"))
					.href,
			};
		}

		if (specifier === "next/headers") {
			return {
				shortCircuit: true,
				url: pathToFileURL(path.resolve("node_modules/next/headers.js")).href,
			};
		}

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
	load(url, context, nextLoad) {
		if (!url.startsWith("file:") || !/\.[cm]?tsx?$/.test(url)) {
			return nextLoad(url, context);
		}

		const source = readFileSync(fileURLToPath(url), "utf8");
		const transpiled = ts.transpileModule(source, {
			compilerOptions: {
				jsx: ts.JsxEmit.ReactJSX,
				module: ts.ModuleKind.ESNext,
				moduleResolution: ts.ModuleResolutionKind.Bundler,
				target: ts.ScriptTarget.ES2022,
			},
			fileName: fileURLToPath(url),
		});

		return {
			format: "module",
			shortCircuit: true,
			source: transpiled.outputText,
		};
	},
});

const proxyModulePath = pathToFileURL(path.resolve("src/proxy.ts")).href;
const i18nTypesModule = (await import(
	"../../../src/lib/i18n/types"
)) as typeof import("../../../src/lib/i18n/types");
const i18nModule = (await import(
	"../../../src/lib/i18n/t"
)) as typeof import("../../../src/lib/i18n/t");
const settingsRegistryModule = (await import(
	"../../../src/lib/settings/registry"
)) as typeof import("../../../src/lib/settings/registry");
const settingsNavModule = (await import(
	"../../../src/components/settings/SettingsNav"
)) as typeof import("../../../src/components/settings/SettingsNav");
const settingsPageModule = (await import(
	"../../../src/app/workspace/settings/page"
)) as typeof import("../../../src/app/workspace/settings/page");
const { NextRequest } = (await import(
	"next/server.js"
)) as typeof import("next/server");
type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];
const { authorizeRequest } = (await import(
	proxyModulePath
)) as typeof import("../../../src/proxy");
const { LOCALES } = i18nTypesModule;
const { t } = i18nModule;
const {
	DEFAULT_SETTINGS_KEY,
	SETTINGS_ENTRIES,
	SETTINGS_KEYS,
	buildSettingsNavItems,
	parseSettingsKey,
	settingsContentModel,
	settingsEntryByKey,
	settingsKeyFromPathname,
	settingsShellModel,
} = settingsRegistryModule;
const { SettingsNavList } = settingsNavModule;
const { SettingsContentPanel } = settingsPageModule;

test("settings registry covers every documented settings entry point", () => {
	assert.deepEqual(
		[...SETTINGS_KEYS],
		[
			"members",
			"invitations",
			"byok",
			"vision",
			"capabilities",
			"debug-log",
			"language",
			"disclaimer",
			"branding",
			"danger-zone",
		],
	);
	assert.equal(DEFAULT_SETTINGS_KEY, "members");

	for (const entry of SETTINGS_ENTRIES) {
		assert.equal(settingsEntryByKey[entry.key], entry);
		assert.equal(parseSettingsKey(entry.key), entry.key);
		assert.equal(entry.route, `/workspace/settings/${entry.key}`);
		assert.ok(entry.ownerBead.startsWith("ssfw-"));
		assert.ok(existsSync(routeFileFor(entry.key)), `${entry.key} route exists`);
	}
	assert.equal(
		settingsEntryByKey.invitations.labelKey,
		"settings.invitations.title",
	);
});

test("settings nav renders all registered subroutes in four locales", () => {
	for (const locale of LOCALES) {
		const navItems = buildSettingsNavItems(locale, "vision");
		const html = renderToStaticMarkup(
			createElement(SettingsNavList, {
				locale,
				selectedKey: "vision",
			}),
		);

		assert.equal(navItems.length, SETTINGS_KEYS.length);
		assertHtmlIncludes(html, settingsShellModel(locale).navAriaLabel);
		assert.match(html, /href="\/workspace\/settings\/vision"/);
		assert.match(html, /aria-current="page"/);
		const invitationsLabel = t("settings.invitations.title", locale);
		const invitationsItem = navItems.find(
			(candidate) => candidate.href === settingsEntryByKey.invitations.route,
		);
		assert.equal(invitationsItem?.label, invitationsLabel);
		assertHtmlIncludes(html, invitationsLabel);

		for (const entry of SETTINGS_ENTRIES) {
			const item = navItems.find((candidate) => candidate.href === entry.route);
			assert.ok(item);
			assertHtmlIncludes(html, item.label);
		}
	}
});

test("settings entry pages render registered placeholder panels", () => {
	for (const key of SETTINGS_KEYS) {
		const entry = settingsEntryByKey[key];
		const model = settingsContentModel(key, "en");
		const html = renderToStaticMarkup(
			createElement(SettingsContentPanel, {
				model,
			}),
		);

		assert.equal(model.entry, entry);
		assertHtmlIncludes(html, model.label);
		assertHtmlIncludes(html, model.placeholderTitle);
		assertHtmlIncludes(html, model.placeholderBody);
		assert.match(html, /data-owning-bead/);
		assert.doesNotMatch(html, /\?section=/);
	}
});

test("settings path parsing selects the active subroute", () => {
	assert.equal(settingsKeyFromPathname("/workspace/settings"), "members");
	assert.equal(
		settingsKeyFromPathname("/workspace/settings/invitations"),
		"invitations",
	);
	assert.equal(settingsKeyFromPathname("/workspace/settings/byok"), "byok");
	assert.equal(settingsKeyFromPathname("/workspace/settings/vision"), "vision");
	assert.equal(
		settingsKeyFromPathname("/workspace/settings/capabilities"),
		"capabilities",
	);
	assert.equal(
		settingsKeyFromPathname("/workspace/settings/not-real"),
		"members",
	);
});

test("settings shell stays behind the authenticated disclaimer-aware proxy", async () => {
	const session = validSession();
	const unauthenticated = await authorizeRequest(
		request(settingsEntryByKey.language.route),
		async () => null,
		async () => true,
	);

	assert.equal(unauthenticated.status, 307);
	assert.equal(
		new URL(unauthenticated.headers.get("location") ?? "").pathname,
		"/signin",
	);

	const unacknowledged = await authorizeRequest(
		request(settingsEntryByKey.vision.route),
		async () => session,
		async () => false,
		async () => "de",
	);
	const disclaimerLocation = new URL(
		unacknowledged.headers.get("location") ?? "",
	);
	assert.equal(disclaimerLocation.pathname, "/disclaimer");
	assert.equal(disclaimerLocation.searchParams.get("locale"), "de");

	const acknowledged = await authorizeRequest(
		request(settingsEntryByKey.members.route),
		async () => session,
		async () => true,
	);
	assert.equal(acknowledged.status, 200);
	assert.equal(acknowledged.headers.get("x-middleware-next"), "1");
});

function request(
	pathname: string,
	init: NextRequestInit = {},
): NextRequestType {
	return new NextRequest(`https://app.example.test${pathname}`, init);
}

function validSession() {
	return {
		deviceHint: "desktop" as const,
		expiresAt: new Date("2026-05-30T00:00:00.000Z"),
		id: randomUUID(),
		lastSeenAt: new Date("2026-04-30T00:00:00.000Z"),
		tenantId: randomUUID(),
		userId: randomUUID(),
	};
}

function routeFileFor(key: string): string {
	return path.join("src/app/workspace/settings", key, "page.tsx");
}

function assertHtmlIncludes(html: string, text: string): void {
	assert.equal(
		html.includes(text),
		true,
		`Expected rendered HTML to include ${text}`,
	);
}
