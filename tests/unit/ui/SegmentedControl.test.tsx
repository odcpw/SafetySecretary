import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
	ButtonsFixture,
	phaseOptions,
} from "../../../src/components/ui/__fixtures__/buttons";
import SegmentedControl from "../../../src/components/ui/SegmentedControl";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

test("SegmentedControl renders radiogroup semantics and checked state", () => {
	const html = renderToStaticMarkup(
		<SegmentedControl options={phaseOptions} value="baseline" />,
	);

	assert.match(html, /role="radiogroup"/);
	assert.equal(countMatches(html, /type="radio"/g), 3);
	assert.match(html, /aria-checked="true"[^>]*>Baseline/);
	assert.match(html, /aria-checked="false"[^>]*>Residual/);
});

test("SegmentedControl click changes the selected value", async () => {
	const changes: string[] = [];
	const { container, root } = await renderSegmentedControl((value) => {
		changes.push(value);
	});

	const residual = getRadio(container, "Residual");
	await act(async () => {
		residual.click();
	});

	assert.deepEqual(changes, ["residual"]);
	assert.equal(residual.getAttribute("aria-checked"), "true");

	await unmount(root);
});

test("SegmentedControl Arrow, Home, and End keys move selection", async () => {
	const changes: string[] = [];
	const { container, dom, root } = await renderSegmentedControl((value) => {
		changes.push(value);
	});

	await key(getRadio(container, "Baseline"), dom, "ArrowRight");
	assert.equal(radioLabelText(getCheckedRadio(container)), "Residual");

	await key(getRadio(container, "Residual"), dom, "End");
	assert.equal(radioLabelText(getCheckedRadio(container)), "Review");

	await key(getRadio(container, "Review"), dom, "Home");
	assert.equal(radioLabelText(getCheckedRadio(container)), "Baseline");
	assert.deepEqual(changes, ["residual", "review", "baseline"]);

	await unmount(root);
});

test("SegmentedControl disabled state blocks changes", async () => {
	const changes: string[] = [];
	const { container, dom, root } = await renderSegmentedControl(
		(value) => {
			changes.push(value);
		},
		true,
	);

	await key(getRadio(container, "Baseline"), dom, "ArrowRight");
	getRadio(container, "Residual").click();

	assert.deepEqual(changes, []);
	assert.equal(radioLabelText(getCheckedRadio(container)), "Baseline");

	await unmount(root);
});

test("buttons fixture includes SegmentedControl semantics", () => {
	const html = renderToStaticMarkup(<ButtonsFixture />);

	assert.match(html, /aria-label="Risk view"/);
	assert.match(html, /role="radiogroup"/);
	assert.match(html, /type="radio"/);
});

async function renderSegmentedControl(
	onChange?: (value: string) => void,
	disabled = false,
): Promise<{
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
		const [value, setValue] = React.useState("baseline");

		return (
			<SegmentedControl
				aria-label="Risk view"
				disabled={disabled}
				onChange={(nextValue) => {
					onChange?.(nextValue);
					setValue(nextValue);
				}}
				options={phaseOptions}
				value={value}
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

function getRadio(container: HTMLElement, label: string): HTMLInputElement {
	const match = [
		...container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
	].find((radio) => radioLabelText(radio) === label);
	if (!match) {
		throw new Error(`radio "${label}" should render`);
	}
	return match;
}

function getCheckedRadio(container: HTMLElement): HTMLInputElement | null {
	return container.querySelector<HTMLInputElement>(
		'input[type="radio"][aria-checked="true"]',
	);
}

function radioLabelText(radio: HTMLInputElement | null): string | null {
	return radio?.closest("label")?.textContent ?? null;
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
