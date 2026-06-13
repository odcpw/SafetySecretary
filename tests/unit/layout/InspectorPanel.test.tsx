import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import Button from "../../../src/components/ui/Button";
import InspectorPanel from "../../../src/components/layout/InspectorPanel";
import { InspectorPanelFixture } from "../../../src/components/layout/__fixtures__/inspector";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

test("InspectorPanel renders non-modal region semantics by default", () => {
	const html = renderPanel();

	assert.match(html, /<section/);
	assert.match(html, /aria-labelledby=/);
	assert.doesNotMatch(html, /aria-modal/);
	assert.match(html, /Details/);
});

test("InspectorPanel anchors bottom on mobile and right on desktop", () => {
	const html = renderPanel();

	assert.match(html, /items-end/);
	assert.match(html, /lg:items-stretch/);
	assert.match(html, /lg:justify-end/);
	assert.match(html, /rounded-t-md/);
	assert.match(html, /lg:rounded-l-md/);
	assert.match(html, /lg:max-w-md/);
});

test("InspectorPanel supports modal dialog semantics", () => {
	const html = renderPanel({ modal: true, size: "lg" });

	assert.match(html, /role="dialog"/);
	assert.match(html, /aria-modal="true"/);
	assert.match(html, /lg:max-w-xl/);
});

test("InspectorPanel moves focus in, closes on Escape, and restores focus", async () => {
	const dom = setupDom();
	const { document } = dom;
	const trigger = document.createElement("button");
	trigger.textContent = "Open inspector";
	document.body.append(trigger);
	trigger.focus();
	const container = document.createElement("div");
	document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	function Harness() {
		const React = require("react") as typeof import("react");
		const [isOpen, setIsOpen] = React.useState(true);

		return (
			<InspectorPanel
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
				title="Details"
			>
				<button type="button">Save</button>
			</InspectorPanel>
		);
	}

	await act(async () => {
		root.render(<Harness />);
	});

	const save = buttonByText(container, "Save");
	assert.equal(document.activeElement, save);

	await key(save, dom, "Escape");
	assert.equal(container.querySelector("section"), null);
	assert.equal(document.activeElement, trigger);

	await unmount(root);
});

test("InspectorPanel closes on scrim click only when enabled", async () => {
	const first = await renderInteractive({ dismissOnScrim: true });
	first.scrim.click();
	assert.equal(first.closeCount(), 1);
	await unmount(first.root);

	const second = await renderInteractive({ dismissOnScrim: false });
	second.scrim.click();
	assert.equal(second.closeCount(), 0);
	await unmount(second.root);
});

test("InspectorPanel closes on Escape even when focus leaves non-modal panel", async () => {
	const dom = setupDom();
	const { document } = dom;
	const externalButton = document.createElement("button");
	externalButton.textContent = "Outside action";
	document.body.append(externalButton);
	const container = document.createElement("div");
	document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	function Harness() {
		const React = require("react") as typeof import("react");
		const [isOpen, setIsOpen] = React.useState(true);

		return (
			<InspectorPanel
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
				title="Details"
			>
				<button type="button">Save</button>
			</InspectorPanel>
		);
	}

	await act(async () => {
		root.render(<Harness />);
	});

	externalButton.focus();
	await key(externalButton, dom, "Escape");

	assert.equal(container.querySelector("section"), null);
	assert.equal(document.activeElement, externalButton);

	await unmount(root);
});

test("InspectorPanel traps Tab only in modal mode", async () => {
	const dom = setupDom();
	const container = dom.document.createElement("div");
	dom.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<InspectorPanel
				isOpen
				modal
				onClose={() => undefined}
				title="Details"
			>
				<button type="button">First</button>
				<button type="button">Last</button>
			</InspectorPanel>,
		);
	});

	const first = buttonByText(container, "First");
	const last = buttonByText(container, "Last");

	await key(last, dom, "Tab");
	assert.equal(dom.document.activeElement, first);

	await key(first, dom, "Tab", true);
	assert.equal(dom.document.activeElement, last);

	await unmount(root);
});

test("InspectorPanel consumes dark tokens and has no hard-coded colours", () => {
	const html = renderPanel();

	assert.match(html, /var\(--color-bg\)/);
	assert.match(html, /var\(--color-surface-elev\)/);
	assert.match(html, /var\(--color-border\)/);
	assert.doesNotMatch(html, /#[0-9A-Fa-f]{3,8}/);
});

test("InspectorPanel fixture renders selected item details without domain copy", () => {
	const html = renderToStaticMarkup(<InspectorPanelFixture />);

	assert.match(html, /aria-label="Inspector fixture"/);
	assert.match(html, /Review selected item properties/);
	assert.doesNotMatch(html, /HIRA|JHA|Incident/);
});

function renderPanel(
	props: Partial<React.ComponentProps<typeof InspectorPanel>> = {},
): string {
	return renderToStaticMarkup(
		<InspectorPanel
			isOpen
			onClose={() => undefined}
			title="Details"
			{...props}
		>
			<Button>Save</Button>
		</InspectorPanel>,
	);
}

async function renderInteractive(
	props: Partial<React.ComponentProps<typeof InspectorPanel>>,
): Promise<{
	closeCount: () => number;
	root: Root;
	scrim: HTMLButtonElement;
}> {
	const dom = setupDom();
	const container = dom.document.createElement("div");
	dom.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);
	let closes = 0;

	await act(async () => {
		root.render(
			<InspectorPanel
				isOpen
				onClose={() => {
					closes += 1;
				}}
				title="Details"
				{...props}
			>
				<button type="button">Save</button>
			</InspectorPanel>,
		);
	});

	const scrim = container.querySelector<HTMLButtonElement>(
		'button[aria-label="Close inspector"]',
	);
	assert.ok(scrim, "scrim button should render");
	const scrimButton = scrim;

	return { closeCount: () => closes, root, scrim: scrimButton };
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
	container: HTMLElement,
	label: string,
): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find(
		(candidate) => candidate.textContent === label,
	);
	assert.ok(button, `${label} button should render`);
	const matchedButton = button;
	return matchedButton;
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
