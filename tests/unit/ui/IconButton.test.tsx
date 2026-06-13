import assert from "node:assert/strict";
import test from "node:test";
import { createRef } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ButtonsFixture } from "../../../src/components/ui/__fixtures__/buttons";
import IconButton from "../../../src/components/ui/IconButton";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

test("IconButton requires and renders an accessible name", () => {
	const html = renderToStaticMarkup(
		<IconButton aria-label="Collapse sidebar" icon="C" />,
	);

	assert.match(html, /<button\b/);
	assert.match(html, /aria-label="Collapse sidebar"/);
	assert.match(html, /aria-hidden="true"[^>]*>C<\/span>/);
	assert.doesNotMatch(html, /role="button"/);
});

test("IconButton exposes disabled semantics", () => {
	const html = renderToStaticMarkup(
		<IconButton aria-label="Unavailable" disabled icon="D" />,
	);

	assert.match(html, /disabled=""/);
	assert.match(html, /aria-disabled="true"/);
});

test("IconButton forwards refs and keeps native click behavior", async () => {
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);
	const ref = createRef<HTMLButtonElement>();
	let clicks = 0;

	await act(async () => {
		root.render(
			<IconButton
				aria-label="Collapse sidebar"
				icon="C"
				onClick={() => clicks += 1}
				ref={ref}
			/>,
		);
	});

	assert.equal(ref.current?.tagName, "BUTTON");
	ref.current?.click();
	assert.equal(clicks, 1);

	await unmount(root);
});

test("buttons fixture includes labelled icon buttons", () => {
	const html = renderToStaticMarkup(<ButtonsFixture />);

	assert.match(html, /aria-label="Collapse sidebar"/);
	assert.match(html, /aria-label="Close dialog"/);
	assert.match(html, /aria-label="Disabled action"/);
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
	globals.KeyboardEvent = dom.window.KeyboardEvent;
	globals.HTMLButtonElement = dom.window.HTMLButtonElement;
	globals.Node = dom.window.Node;
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: dom.window.navigator,
	});
	return dom;
}

async function unmount(root: Root): Promise<void> {
	await act(async () => {
		root.unmount();
	});
}

type TestDom = {
	window: Window & typeof globalThis;
};
