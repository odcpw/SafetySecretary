import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { OverlaysFixture } from "../../../src/components/ui/__fixtures__/overlays";
import Modal from "../../../src/components/ui/Modal";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

test("Modal renders dialog semantics when open", () => {
	const html = renderToStaticMarkup(
		<Modal isOpen onClose={() => undefined} title="Confirm delete">
			<button type="button">Delete</button>
		</Modal>,
	);

	assert.match(html, /role="dialog"/);
	assert.match(html, /aria-modal="true"/);
	assert.match(html, /aria-labelledby=/);
	assert.match(html, /Confirm delete/);
});

test("Modal returns null when closed", () => {
	const html = renderToStaticMarkup(
		<Modal isOpen={false} onClose={() => undefined} title="Confirm delete">
			<button type="button">Delete</button>
		</Modal>,
	);

	assert.equal(html, "");
});

test("Modal traps focus, closes on Escape, and returns focus", async () => {
	const dom = setupDom();
	const { document } = dom;
	const body = document.body;
	const container = document.createElement("div");
	body.append(container);
	const trigger = document.createElement("button");
	trigger.textContent = "Open modal";
	body.append(trigger);
	trigger.focus();
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);
	let closes = 0;

	await act(async () => {
		root.render(
			<Modal
				isOpen
				onClose={() => {
					closes += 1;
				}}
				title="Confirm delete"
			>
				<button type="button">Delete</button>
				<button type="button">Cancel</button>
			</Modal>,
		);
	});

	const buttons = [...container.querySelectorAll("button")];
	const firstAction = buttonByText(buttons, "Delete");
	const lastAction = buttonByText(buttons, "Cancel");
	assert.equal(document.activeElement, firstAction);

	await key(lastAction, dom, "Tab");
	assert.equal(document.activeElement, firstAction);

	await key(firstAction, dom, "Tab", true);
	assert.equal(document.activeElement, lastAction);

	await key(firstAction, dom, "Escape");
	assert.equal(closes, 1);

	await unmount(root);
	assert.equal(document.activeElement, trigger);
});

test("overlays fixture includes modal semantics", () => {
	const html = renderToStaticMarkup(<OverlaysFixture />);

	assert.match(html, /aria-label="Overlay fixture"/);
	assert.match(html, /Confirm delete/);
	assert.match(html, /role="dialog"/);
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
	globals.KeyboardEvent = dom.window.KeyboardEvent;
	globals.HTMLButtonElement = dom.window.HTMLButtonElement;
	globals.Node = dom.window.Node;
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: dom.window.navigator,
	});
	return { document, window: dom.window };
}

function buttonByText(
	buttons: HTMLButtonElement[],
	label: string,
): HTMLButtonElement {
	const button = buttons.find((candidate) => candidate.textContent === label);
	assert.ok(button, `${label} button should render`);
	return button;
}

async function key(
	target: HTMLElement,
	dom: TestDom,
	keyName: string,
	shiftKey = false,
): Promise<void> {
	await act(async () => {
		target.focus();
		target.dispatchEvent(
			new dom.window.KeyboardEvent("keydown", {
				bubbles: true,
				key: keyName,
				shiftKey,
			}),
		);
	});
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
