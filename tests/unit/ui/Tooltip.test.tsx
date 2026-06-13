import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { OverlaysFixture } from "../../../src/components/ui/__fixtures__/overlays";
import Tooltip from "../../../src/components/ui/Tooltip";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

test("Tooltip renders described trigger and hidden tooltip content", () => {
	const html = renderToStaticMarkup(
		<Tooltip content="Hazard Identification and Risk Assessment" delay={0}>
			<button type="button">HIRA</button>
		</Tooltip>,
	);

	assert.match(html, /aria-describedby=/);
	assert.match(html, /role="tooltip"/);
	assert.match(html, /hidden=""/);
	assert.match(html, />HIRA<\/button>/);
});

test("Tooltip appears after focus and hides on blur", async () => {
	const { container, root, dom } = await renderTooltip();
	const trigger = container.querySelector<HTMLElement>("button[aria-describedby]");
	assert.ok(trigger, "tooltip trigger should render");
	const tooltip = container.querySelector<HTMLElement>('[role="tooltip"]');
	assert.ok(tooltip, "tooltip content should render");
	assert.equal(tooltip.hidden, true);

	await act(async () => {
		trigger.focus();
		trigger.dispatchEvent(
			new dom.window.FocusEvent("focusin", { bubbles: true }),
		);
		await wait();
	});

	assert.equal(tooltip.hidden, false);

	await act(async () => {
		trigger.dispatchEvent(
			new dom.window.FocusEvent("focusout", { bubbles: true }),
		);
	});

	assert.equal(tooltip.hidden, true);
	await unmount(root);
});

test("Tooltip appears on hover after the configured delay", async () => {
	const { container, root, dom } = await renderTooltip();
	const trigger = container.querySelector<HTMLElement>("button[aria-describedby]");
	const tooltip = container.querySelector<HTMLElement>('[role="tooltip"]');
	assert.ok(trigger);
	assert.ok(tooltip);

	await act(async () => {
		trigger.dispatchEvent(
			new dom.window.MouseEvent("mouseover", { bubbles: true }),
		);
		await wait();
	});

	assert.equal(tooltip.hidden, false);
	await unmount(root);
});

test("overlays fixture includes tooltip semantics", () => {
	const html = renderToStaticMarkup(<OverlaysFixture />);

	assert.match(html, /role="tooltip"/);
	assert.match(html, /Hazard Identification and Risk Assessment/);
});

async function renderTooltip(): Promise<{
	container: HTMLDivElement;
	dom: TestDom;
	root: Root;
}> {
	const dom = setupDom();
	const { document } = dom;
	const body = document.body;
	const container = document.createElement("div");
	body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<Tooltip content="Hazard Identification and Risk Assessment" delay={0}>
				<button type="button">HIRA</button>
			</Tooltip>,
		);
	});

	return { container, dom, root };
}

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
	globals.FocusEvent = dom.window.FocusEvent;
	globals.MouseEvent = dom.window.MouseEvent;
	globals.Node = dom.window.Node;
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: dom.window.navigator,
	});
	return { document, window: dom.window };
}

function wait(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
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
