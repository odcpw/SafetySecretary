import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ShellNavFixture } from "../../../src/components/ui/__fixtures__/shell-nav";
import TopBar from "../../../src/components/ui/TopBar";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

test("TopBar renders brand, content, and actions slots", () => {
	const html = renderToStaticMarkup(
		<TopBar
			actions={<button type="button">Create</button>}
			brand={<strong>Safety Secretary</strong>}
			content={<span>Workspace</span>}
		/>,
	);

	assert.match(html, /<header\b/);
	assert.match(html, /Safety Secretary/);
	assert.match(html, /Workspace/);
	assert.match(html, /<button[^>]+type="button"[^>]*>Create<\/button>/);
});

test("TopBar keeps inventory title/search props usable", async () => {
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);
	const queries: string[] = [];

	await act(async () => {
		root.render(
			<TopBar
				actions={<button type="button">New HIRA</button>}
				onSearch={(query) => queries.push(query)}
				searchPlaceholder="Search cases"
				title="Safety Secretary"
			/>,
		);
	});

	const input = container.querySelector<HTMLInputElement>(
		'input[type="search"]',
	);
	assert.ok(input, "search input should render when search props are supplied");

	await act(async () => {
		setNativeInputValue(input, dom, "incident");
		input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	});

	assert.deepEqual(queries, ["incident"]);
	await unmount(root);
});

test("shell navigation fixture includes TopBar content", () => {
	const html = renderToStaticMarkup(<ShellNavFixture />);

	assert.match(html, /Safety Secretary/);
	assert.match(html, /HIRA workspace/);
	assert.match(html, /New HIRA/);
});

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
	globals.HTMLInputElement = dom.window.HTMLInputElement;
	globals.Node = dom.window.Node;
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: dom.window.navigator,
	});
	return dom;
}

function setNativeInputValue(
	input: HTMLInputElement,
	dom: TestDom,
	value: string,
): void {
	const valueSetter = Object.getOwnPropertyDescriptor(
		dom.window.HTMLInputElement.prototype,
		"value",
	)?.set;
	valueSetter?.call(input, value);
}

async function unmount(root: Root): Promise<void> {
	await act(async () => {
		root.unmount();
	});
}

type TestDom = {
	window: Window & typeof globalThis;
};
