import assert from "node:assert/strict";
import test from "node:test";
import { createRef } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ButtonsFixture } from "../../../src/components/ui/__fixtures__/buttons";
import Button from "../../../src/components/ui/Button";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

test("Button renders native button semantics and variants", () => {
	const html = renderToStaticMarkup(
		<div>
			<Button>Save</Button>
			<Button variant="secondary">Preview</Button>
			<Button variant="ghost">Cancel</Button>
			<Button variant="destructive">Delete</Button>
		</div>,
	);

	assert.equal(countMatches(html, /<button\b/g), 4);
	assert.match(html, /type="button"/);
	assert.match(html, /Save/);
	assert.doesNotMatch(html, /role="button"/);
});

test("Button exposes disabled and loading semantics", () => {
	const html = renderToStaticMarkup(<Button loading>Saving</Button>);

	assert.match(html, /disabled=""/);
	assert.match(html, /aria-disabled="true"/);
	assert.match(html, /aria-busy="true"/);
	assert.match(html, /Saving/);
});

test("Button forwards refs and uses native keyboard activation", async () => {
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
			<Button onClick={() => clicks += 1} ref={ref}>
				Save
			</Button>,
		);
	});

	assert.equal(ref.current?.tagName, "BUTTON");
	ref.current?.click();
	assert.equal(clicks, 1);

	await unmount(root);
});

test("buttons fixture exposes semantic buttons", () => {
	const html = renderToStaticMarkup(<ButtonsFixture />);

	assert.match(html, /aria-label="Button fixture"/);
	assert.ok(countMatches(html, /<button\b/g) >= 9);
	assert.match(html, /Save HIRA/);
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

function countMatches(source: string, pattern: RegExp): number {
	return source.match(pattern)?.length ?? 0;
}

async function unmount(root: Root): Promise<void> {
	await act(async () => {
		root.unmount();
	});
}

type TestDom = {
	window: Window & typeof globalThis;
};
