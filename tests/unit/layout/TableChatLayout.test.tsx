import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import Button from "../../../src/components/ui/Button";
import { TableChatLayout } from "../../../src/components/layout/TableChatLayout";
import { TableChatLayoutFixture } from "../../../src/components/layout/__fixtures__/table-chat";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

test("TableChatLayout renders table and helper panes with semantic labels", () => {
	const html = renderLayout();

	assert.match(html, /aria-label="Table and helper layout"/);
	assert.match(html, /data-pane="main"/);
	assert.match(html, /data-pane="chat"/);
	assert.match(html, /data-splitter="table-chat"/);
	assert.match(html, /aria-orientation="vertical"/);
	assert.match(html, /Rows/);
	assert.match(html, /Helper/);
});

test("TableChatLayout uses design tokens and no hard-coded colour values", () => {
	const html = renderLayout();

	assert.match(html, /var\(--color-bg\)/);
	assert.match(html, /var\(--color-border\)/);
	assert.match(html, /var\(--color-surface\)/);
	assert.match(html, /var\(--color-text\)/);
	assert.doesNotMatch(html, /#[0-9A-Fa-f]{3,8}/);
});

test("TableChatLayout exposes responsive single-column collapse signal", () => {
	const html = renderLayout();

	assert.match(html, /data-collapse-breakpoint="1024"/);
	assert.match(html, /max-lg:order-last/);
	assert.match(html, /data-secondary-surface="true"/);
});

test("TableChatLayout hides the helper pane when the caller toggles it", () => {
	const html = renderLayout({ chatHidden: true });

	assert.match(html, /data-chat-hidden="true"/);
	assert.doesNotMatch(html, /data-pane="chat"/);
	assert.doesNotMatch(html, /data-splitter="table-chat"/);
});

test("TableChatLayout clamps pointer resize to minimum widths", async () => {
	const { container, root, dom } = await renderDomLayout();
	const shell = container.querySelector<HTMLElement>(
		"[aria-label='Table and helper layout']",
	);
	const splitter = container.querySelector<HTMLElement>(
		"[data-splitter='table-chat']",
	);
	assert.ok(shell);
	assert.ok(splitter);

	shell.getBoundingClientRect = () => domRect({ left: 0, right: 900, width: 900 });

	await act(async () => {
		dispatchPointer(dom, splitter, "pointerdown", 700);
	});

	assert.equal(shell.style.getPropertyValue("--ssfw-table-chat-chat-width"), "320px");
	assert.equal(splitter.getAttribute("aria-valuenow"), "320");

	await act(async () => {
		dispatchPointer(dom, dom.window, "pointermove", 50);
	});

	assert.equal(shell.style.getPropertyValue("--ssfw-table-chat-chat-width"), "420px");
	assert.equal(splitter.getAttribute("aria-valuenow"), "420");

	await unmount(root);
});

test("TableChatLayout keyboard resize respects the helper minimum", async () => {
	const { container, root, dom } = await renderDomLayout({
		initialChatWidth: 340,
	});
	const splitter = container.querySelector<HTMLElement>(
		"[data-splitter='table-chat']",
	);
	assert.ok(splitter);

	await act(async () => {
		splitter.dispatchEvent(
			new dom.window.KeyboardEvent("keydown", {
				bubbles: true,
				key: "ArrowRight",
			}),
		);
		splitter.dispatchEvent(
			new dom.window.KeyboardEvent("keydown", {
				bubbles: true,
				key: "ArrowRight",
			}),
		);
	});

	assert.equal(splitter.getAttribute("aria-valuenow"), "320");

	await unmount(root);
});

test("TableChatLayout keyboard resize respects the main pane minimum", async () => {
	const { container, root, dom } = await renderDomLayout();
	const shell = container.querySelector<HTMLElement>(
		"[aria-label='Table and helper layout']",
	);
	const splitter = container.querySelector<HTMLElement>(
		"[data-splitter='table-chat']",
	);
	assert.ok(shell);
	assert.ok(splitter);

	shell.getBoundingClientRect = () => domRect({ left: 0, right: 900, width: 900 });

	await act(async () => {
		for (let index = 0; index < 5; index += 1) {
			splitter.dispatchEvent(
				new dom.window.KeyboardEvent("keydown", {
					bubbles: true,
					key: "ArrowLeft",
				}),
			);
		}
	});

	assert.equal(shell.style.getPropertyValue("--ssfw-table-chat-chat-width"), "420px");
	assert.equal(splitter.getAttribute("aria-valuenow"), "420");

	await unmount(root);
});

test("TableChatLayout fixture renders visible and hidden variants", () => {
	const html = renderToStaticMarkup(<TableChatLayoutFixture />);

	assert.equal(countMatches(html, /Table and helper layout/g), 1);
	assert.equal(countMatches(html, /Table layout without helper/g), 1);
	assert.equal(countMatches(html, /data-chat-hidden="true"/g), 1);
	assert.equal(countMatches(html, /data-chat-hidden="false"/g), 1);
});

function renderLayout(
	props: Partial<Parameters<typeof TableChatLayout>[0]> = {},
): string {
	return renderToStaticMarkup(
		<TableChatLayout
			aria-label="Table and helper layout"
			chat={<p>Helper content</p>}
			chatControls={<Button variant="ghost">Hide</Button>}
			chatLabel="Helper"
			main={<p>Rows content</p>}
			mainLabel="Rows"
			splitterLabel="Resize helper pane"
			{...props}
		/>,
	);
}

async function renderDomLayout(
	props: Partial<Parameters<typeof TableChatLayout>[0]> = {},
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

	await act(async () => {
		root.render(
			<TableChatLayout
				aria-label="Table and helper layout"
				chat={<p>Helper content</p>}
				chatControls={<Button variant="ghost">Hide</Button>}
				chatLabel="Helper"
				main={<p>Rows content</p>}
				mainLabel="Rows"
				splitterLabel="Resize helper pane"
				{...props}
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
	globals.KeyboardEvent = dom.window.KeyboardEvent;
	return dom;
}

function dispatchPointer(
	dom: TestDom,
	target: EventTarget,
	type: string,
	clientX: number,
) {
	const event = new dom.window.Event(type, { bubbles: true });
	Object.defineProperty(event, "clientX", { value: clientX });
	Object.defineProperty(event, "pointerId", { value: 1 });
	target.dispatchEvent(event);
}

function domRect({
	left,
	right,
	width,
}: {
	left: number;
	right: number;
	width: number;
}): DOMRect {
	return {
		bottom: 0,
		height: 0,
		left,
		right,
		toJSON: () => ({}),
		top: 0,
		width,
		x: left,
		y: 0,
	};
}

async function unmount(root: Root): Promise<void> {
	await act(async () => {
		root.unmount();
	});
}

function countMatches(source: string, pattern: RegExp): number {
	return source.match(pattern)?.length ?? 0;
}

type TestDom = {
	window: Window & typeof globalThis;
};
