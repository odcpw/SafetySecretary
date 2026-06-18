import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server.js";
import LocaleSwitcher from "../../../src/components/ui/LocaleSwitcher";
import type { Locale } from "../../../src/lib/i18n/types";
import {
	handleLocalePatch,
	type LocalePreferenceStore,
} from "../../../src/app/api/user/locale/route";

const requireFromTest = createRequire(import.meta.url);
const { JSDOM } = requireFromTest("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

const userId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";

test("LocaleSwitcher renders all four locale choices", () => {
	const html = renderToStaticMarkup(<LocaleSwitcher locale="en" />);

	assert.match(html, /<select\b/);
	assert.match(html, /value="de"/);
	assert.match(html, /value="en"/);
	assert.match(html, /value="fr"/);
	assert.match(html, /value="it"/);
	assert.match(html, />Language</);
});

test("LocaleSwitcher persists selected locale through the API route", async () => {
	const dom = setupDom();
	// The CSRF token is now server-minted and read-only on the client, so seed
	// the cookie the proxy would have issued before exercising the switcher.
	dom.window.document.cookie = "ssfw_csrf=server-bound-csrf-token; Path=/";
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const root = createRoot(container);
	const requests: Array<{
		body: string | null;
		credentials: RequestCredentials | null;
		csrf: string | null;
		method: string;
		url: string;
	}> = [];
	const changes: Locale[] = [];
	const globals = globalThis as unknown as {
		fetch: typeof fetch;
	};
	const originalFetch = globals.fetch;

	globals.fetch = async (input, init) => {
		const headers = new Headers(init?.headers);
		requests.push({
			body: typeof init?.body === "string" ? init.body : null,
			csrf: headers.get("x-ssfw-csrf"),
			credentials: init?.credentials ?? null,
			method: init?.method ?? "GET",
			url: String(input),
		});
		return new Response(JSON.stringify({ locale: "fr" }), { status: 200 });
	};

	try {
		await act(async () => {
			root.render(
				<LocaleSwitcher
					locale="en"
					onLocaleChange={(locale) => changes.push(locale)}
				/>,
			);
		});

		const select = container.querySelector("select");
		assert.ok(select, "locale select should render");

		await act(async () => {
			select.value = "fr";
			select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
			await Promise.resolve();
		});

		assert.deepEqual(requests, [
			{
				body: JSON.stringify({ locale: "fr" }),
				csrf: decodeURIComponent(cookieValue(dom.window.document.cookie, "ssfw_csrf") ?? ""),
				credentials: "same-origin",
				method: "PATCH",
				url: "/api/user/locale",
			},
		]);
		assert.ok(requests[0]?.csrf, "locale PATCH should send a CSRF header");
		assert.deepEqual(changes, ["fr"]);
	} finally {
		globals.fetch = originalFetch;
		await unmount(root);
	}
});

test("locale PATCH updates only the current session user's tenant membership", async () => {
	const store = new MemoryLocaleStore(true);
	const request = new NextRequest("https://app.example.test/api/user/locale", {
		body: JSON.stringify({ locale: "it" }),
		headers: {
			"content-type": "application/json",
			"x-ssfw-tenant-id": tenantId,
			"x-ssfw-user-id": userId,
		},
		method: "PATCH",
	});

	const response = await handleLocalePatch(request, store);

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { locale: "it" });
	assert.deepEqual(store.updates, [{ locale: "it", tenantId, userId }]);
});

test("locale PATCH rejects unsupported locales and missing tenant membership", async () => {
	const unsupported = await handleLocalePatch(
		new NextRequest("https://app.example.test/api/user/locale", {
			body: JSON.stringify({ locale: "es" }),
			headers: {
				"content-type": "application/json",
				"x-ssfw-tenant-id": tenantId,
				"x-ssfw-user-id": userId,
			},
			method: "PATCH",
		}),
		new MemoryLocaleStore(true),
	);

	assert.equal(unsupported.status, 400);
	assert.deepEqual(await unsupported.json(), { code: "UNSUPPORTED_LOCALE" });

	const missingMembershipStore = new MemoryLocaleStore(false);
	const forbidden = await handleLocalePatch(
		new NextRequest("https://app.example.test/api/user/locale", {
			body: JSON.stringify({ locale: "de" }),
			headers: {
				"content-type": "application/json",
				"x-ssfw-tenant-id": tenantId,
				"x-ssfw-user-id": userId,
			},
			method: "PATCH",
		}),
		missingMembershipStore,
	);

	assert.equal(forbidden.status, 403);
	assert.deepEqual(await forbidden.json(), {
		code: "TENANT_MEMBERSHIP_REQUIRED",
	});
	assert.deepEqual(missingMembershipStore.updates, [
		{ locale: "de", tenantId, userId },
	]);
});

class MemoryLocaleStore implements LocalePreferenceStore {
	readonly updates: Array<{ locale: Locale; tenantId: string; userId: string }> =
		[];

	constructor(private readonly shouldUpdate: boolean) {}

	async updateUserLocale(input: {
		locale: Locale;
		tenantId: string;
		userId: string;
	}): Promise<boolean> {
		this.updates.push(input);
		return this.shouldUpdate;
	}
}

function setupDom(): TestDom {
	const dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "https://app.example.test",
	});
	const globals = globalThis as unknown as Record<string, unknown>;
	globals.IS_REACT_ACT_ENVIRONMENT = true;
	globals.window = dom.window;
	globals.document = dom.window.document;
	globals.HTMLElement = dom.window.HTMLElement;
	globals.Event = dom.window.Event;
	globals.HTMLSelectElement = dom.window.HTMLSelectElement;
	globals.Node = dom.window.Node;
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: dom.window.navigator,
	});
	return dom;
}

function cookieValue(cookieHeader: string, name: string): string | undefined {
	return cookieHeader
		.split(";")
		.map((value) => value.trim())
		.find((value) => value.startsWith(`${name}=`))
		?.slice(name.length + 1);
}

type TestDom = {
	window: Window & typeof globalThis;
};

async function unmount(root: Root): Promise<void> {
	await act(async () => {
		root.unmount();
	});
}
