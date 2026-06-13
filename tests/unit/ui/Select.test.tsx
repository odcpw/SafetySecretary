import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
	PickerFixture,
	severityOptions,
} from "../../../src/components/ui/__fixtures__/pickers";
import Select from "../../../src/components/ui/Select";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

test("Select renders native select semantics with label and options", () => {
	const html = renderToStaticMarkup(
		<Select
			label="Severity"
			options={severityOptions}
			placeholder="Choose severity"
		/>,
	);

	assert.match(html, /<select\b/);
	assert.doesNotMatch(html, /role="combobox"/);
	assert.match(
		html,
		/<option disabled="" value=""(?: selected="")?>Choose severity<\/option>/,
	);
	assert.match(html, /<option value="A">A - catastrophic<\/option>/);
});

test("Select calls onChange with the selected value", async () => {
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);
	const changes: string[] = [];

	await act(async () => {
		root.render(
			<Select
				label="Severity"
				onChange={(value) => changes.push(value)}
				options={severityOptions}
				placeholder="Choose severity"
			/>,
		);
	});

	const select = container.querySelector("select");
	assert.ok(select, "native select should render");

	await act(async () => {
		select.value = "B";
		select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
	});

	assert.deepEqual(changes, ["B"]);
	await unmount(root);
});

test("picker fixture exposes one native select", () => {
	const html = renderToStaticMarkup(<PickerFixture />);

	assert.match(html, /aria-label="Picker fixture"/);
	assert.equal(countMatches(html, /<select\b/g), 1);
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
	globals.HTMLSelectElement = dom.window.HTMLSelectElement;
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

type TestDom = {
	window: Window & typeof globalThis;
};

async function unmount(root: Root): Promise<void> {
	await act(async () => {
		root.unmount();
	});
}
