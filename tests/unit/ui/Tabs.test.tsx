import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
	ShellNavFixture,
	shellTabs,
} from "../../../src/components/ui/__fixtures__/shell-nav";
import Tabs from "../../../src/components/ui/Tabs";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

test("Tabs renders tablist, tabs, and tabpanels with selected state", () => {
	const html = renderToStaticMarkup(
		<Tabs activeValue="hazards" tabs={shellTabs} />,
	);

	assert.match(html, /role="tablist"/);
	assert.equal(countMatches(html, /role="tab"/g), 3);
	assert.equal(countMatches(html, /role="tabpanel"/g), 3);
	assert.match(html, /aria-selected="true"[^>]*>Hazards/);
	assert.match(html, /hidden=""[^>]*>Control measures/);
});

test("Tabs Arrow, Home, and End keys move between enabled tabs", async () => {
	const { container, dom, root } = await renderTabs();
	const tabs = () => [
		...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
	];

	assert.equal(selectedTab(container)?.textContent, "Hazards");
	await key(tabs()[0], dom, "ArrowRight");
	assert.equal(selectedTab(container)?.textContent, "Controls");

	await key(tabs()[1], dom, "End");
	assert.equal(selectedTab(container)?.textContent, "Controls");

	await key(tabs()[1], dom, "Home");
	assert.equal(selectedTab(container)?.textContent, "Hazards");

	await key(tabs()[0], dom, "ArrowLeft");
	assert.equal(selectedTab(container)?.textContent, "Controls");

	await unmount(root);
});

test("Tabs skips disabled tabs when clicked or traversed", async () => {
	const { container, dom, root } = await renderTabs();
	const tabs = [
		...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
	];

	assert.equal(tabs[2].disabled, true);
	await key(tabs[1], dom, "ArrowRight");
	assert.equal(selectedTab(container)?.textContent, "Hazards");

	await unmount(root);
});

test("shell navigation fixture includes Tabs semantics", () => {
	const html = renderToStaticMarkup(<ShellNavFixture />);

	assert.match(html, /role="tablist"/);
	assert.match(html, /role="tabpanel"/);
	assert.match(html, /Open hazards/);
});

async function renderTabs(): Promise<{
	container: HTMLDivElement;
	dom: TestDom;
	root: Root;
}> {
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	function Harness() {
		const React = require("react") as typeof import("react");
		const [activeValue, setActiveValue] = React.useState("hazards");
		return (
			<Tabs
				activeValue={activeValue}
				onChange={setActiveValue}
				tabs={shellTabs}
			/>
		);
	}

	await act(async () => {
		root.render(<Harness />);
	});

	return { container, dom, root };
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
	globals.KeyboardEvent = dom.window.KeyboardEvent;
	globals.HTMLButtonElement = dom.window.HTMLButtonElement;
	globals.Node = dom.window.Node;
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: dom.window.navigator,
	});
	return dom;
}

async function key(
	button: HTMLButtonElement,
	dom: TestDom,
	keyName: string,
): Promise<void> {
	await act(async () => {
		button.focus();
		button.dispatchEvent(
			new dom.window.KeyboardEvent("keydown", {
				bubbles: true,
				key: keyName,
			}),
		);
	});
}

function selectedTab(container: HTMLElement): HTMLButtonElement | null {
	return container.querySelector<HTMLButtonElement>(
		'[role="tab"][aria-selected="true"]',
	);
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
