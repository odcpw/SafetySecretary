import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { OverlaysFixture } from "../../../src/components/ui/__fixtures__/overlays";
import Toast from "../../../src/components/ui/Toast";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

test("Toast renders status live region for normal variants", () => {
	const html = renderToStaticMarkup(
		<Toast message="HIRA saved successfully" variant="success" />,
	);

	assert.match(html, /role="status"/);
	assert.match(html, /aria-live="polite"/);
	assert.match(html, /HIRA saved successfully/);
});

test("Toast renders alert live region for errors", () => {
	const html = renderToStaticMarkup(
		<Toast message="Unable to save HIRA" variant="error" />,
	);

	assert.match(html, /role="alert"/);
	assert.match(html, /aria-live="assertive"/);
	assert.match(html, /Unable to save HIRA/);
});

test("Toast action button invokes onAction", async () => {
	const dom = setupDom();
	const { document } = dom;
	const body = document.body;
	const container = document.createElement("div");
	body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);
	let actions = 0;

	await act(async () => {
		root.render(
			<Toast
				actionLabel="Undo"
				message="HIRA saved successfully"
				onAction={() => {
					actions += 1;
				}}
			/>,
		);
	});

	const button = container.querySelector("button");
	assert.ok(button, "toast action should render");
	await act(async () => {
		button.click();
	});

	assert.equal(actions, 1);
	await unmount(root);
});

test("overlays fixture includes status and alert toasts", () => {
	const html = renderToStaticMarkup(<OverlaysFixture />);

	assert.match(html, /role="status"/);
	assert.match(html, /role="alert"/);
});

function setupDom(): TestDom {
	const dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "https://app.example.test",
	});
	const { document } = dom.window;
	const globals = globalThis as unknown as Record<string, unknown>;
	globals.IS_REACT_ACT_ENVIRONMENT = true;
	globals.window = dom.window;
	globals.document = document;
	globals.HTMLElement = dom.window.HTMLElement;
	globals.Event = dom.window.Event;
	globals.HTMLButtonElement = dom.window.HTMLButtonElement;
	globals.Node = dom.window.Node;
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: dom.window.navigator,
	});
	return { document, window: dom.window };
}

async function unmount(root: Root): Promise<void> {
	await act(async () => {
		root.unmount();
	});
}

type TestDom = {
	document: Document;
	window: Window & typeof globalThis;
};
