import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
	ownerOptions,
	PickerFixture,
} from "../../../src/components/ui/__fixtures__/pickers";
import ComboBox from "../../../src/components/ui/ComboBox";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

test("ComboBox renders WAI-ARIA combobox semantics", async () => {
	const { container, root } = await renderComboBox();
	const input = getComboBox(container);

	assert.equal(input.getAttribute("role"), "combobox");
	assert.equal(input.getAttribute("aria-autocomplete"), "list");
	assert.equal(input.getAttribute("aria-expanded"), "false");
	assert.ok(input.getAttribute("aria-controls"));
	const listbox = container.querySelector('[role="listbox"]');
	assert.ok(listbox);
	assert.equal(listbox.hasAttribute("hidden"), true);

	await unmount(root);
});

test("ComboBox keyboard selects highlighted options and closes on Escape", async () => {
	const changes: string[] = [];
	const { container, root, dom } = await renderComboBox((value) => {
		changes.push(value);
	});
	const input = getComboBox(container);

	await key(input, dom, "ArrowDown");
	await key(input, dom, "ArrowDown");
	assert.match(input.getAttribute("aria-activedescendant") ?? "", /option-1$/);

	await key(input, dom, "Enter");
	assert.deepEqual(changes, ["owner-maintenance"]);
	assert.equal(input.value, "Maintenance lead");
	assert.equal(input.getAttribute("aria-expanded"), "false");
	assert.equal(
		container.querySelector('[role="listbox"]')?.hasAttribute("hidden"),
		true,
	);

	await key(input, dom, "ArrowDown");
	assert.equal(input.getAttribute("aria-expanded"), "true");
	await key(input, dom, "Escape");
	assert.equal(input.getAttribute("aria-expanded"), "false");

	await unmount(root);
});

test("ComboBox Home and End jump to first and last filtered options", async () => {
	const changes: string[] = [];
	const { container, root, dom } = await renderComboBox((value) => {
		changes.push(value);
	});
	const input = getComboBox(container);

	await key(input, dom, "ArrowDown");
	await key(input, dom, "End");
	assert.match(input.getAttribute("aria-activedescendant") ?? "", /option-2$/);

	await key(input, dom, "Home");
	assert.match(input.getAttribute("aria-activedescendant") ?? "", /option-0$/);

	await key(input, dom, "Enter");
	assert.deepEqual(changes, ["owner-safety"]);

	await unmount(root);
});

test("ComboBox filters by typed label text", async () => {
	const { container, root, dom } = await renderComboBox();
	const input = getComboBox(container);

	await act(async () => {
		setNativeInputValue(input, dom, "maint");
		input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	});

	const options = [...container.querySelectorAll('[role="option"]')];
	assert.equal(
		options.filter((option) => !option.closest("[hidden]")).length,
		1,
	);
	assert.equal(options[0].textContent, "Maintenance lead");

	await unmount(root);
});

test("picker fixture includes one combobox and listbox option roles", () => {
	const html = renderToStaticMarkup(<PickerFixture />);

	assert.match(html, /role="combobox"/);
	assert.match(html, /aria-controls=/);
	assert.match(html, /role="listbox"/);
	assert.match(html, /role="option"/);
});

async function renderComboBox(onChange?: (value: string) => void): Promise<{
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

	await act(async () => {
		root.render(
			<ComboBox
				label="Corrective action owner"
				onChange={onChange}
				options={ownerOptions}
				placeholder="Search owner"
			/>,
		);
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
	globals.HTMLInputElement = dom.window.HTMLInputElement;
	globals.Node = dom.window.Node;
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: dom.window.navigator,
	});
	return dom;
}

function getComboBox(container: HTMLElement): HTMLInputElement {
	const input = container.querySelector<HTMLInputElement>('[role="combobox"]');
	if (!input) {
		throw new Error("combobox input should render");
	}
	return input;
}

async function key(
	input: HTMLInputElement,
	dom: TestDom,
	keyName: string,
): Promise<void> {
	await act(async () => {
		input.focus();
		input.dispatchEvent(
			new dom.window.KeyboardEvent("keydown", {
				bubbles: true,
				key: keyName,
			}),
		);
	});
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
