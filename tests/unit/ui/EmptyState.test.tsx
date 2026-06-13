import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusFixture } from "../../../src/components/ui/__fixtures__/status";
import EmptyState from "../../../src/components/ui/EmptyState";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

// ── runtime DOM tests ───────────────────────────────────────────

test("EmptyState renders a <section> with semantic heading", async () => {
	const { container, root } = await renderEmptyState();
	const section = container.querySelector("section");
	assert.ok(section, "EmptyState should render a <section>");
	const heading = section?.querySelector("h2, h3");
	assert.ok(heading, "EmptyState should contain a semantic heading");
	await unmount(root);
});

test("EmptyState renders title and description", async () => {
	const { container, root } = await renderEmptyState();
	assert.ok(
		container.textContent?.includes("No hazards"),
		"should render the title",
	);
	assert.ok(
		container.textContent?.includes("Start by adding"),
		"should render the description",
	);
	await unmount(root);
});

test("EmptyState renders action button when actionLabel + onAction provided", async () => {
	const { container, root } = await renderEmptyState();
	const button = container.querySelector("button");
	assert.ok(button, "EmptyState should render an action <button>");
	assert.equal(
		button?.getAttribute("type"),
		"button",
		"button should have type='button'",
	);
	assert.equal(
		button?.textContent,
		"Add hazard",
		"button text should match actionLabel",
	);
	await unmount(root);
});

test("EmptyState action button fires onAction onClick", async () => {
	let fired = false;
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<EmptyState
				title="Empty"
				description="Nothing here"
				actionLabel="Go"
				onAction={() => {
					fired = true;
				}}
			/>,
		);
	});

	const button = container.querySelector("button");
	await act(async () => {
		button?.click();
	});

	assert.ok(fired, "onAction should be called on button click");
	await unmount(root);
});

test("EmptyState omits action button when actionLabel missing", async () => {
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(<EmptyState title="Empty" description="Nothing here" />);
	});

	const button = container.querySelector("button");
	assert.equal(button, null, "no action button when actionLabel is absent");
	await unmount(root);
});

test("EmptyState icon is aria-hidden", async () => {
	const { container, root } = await renderEmptyState();
	const icon = container.querySelector('[aria-hidden="true"]');
	assert.ok(icon, "icon element should have aria-hidden='true'");
	await unmount(root);
});

test("EmptyState size=lg uses <h2> heading", async () => {
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<EmptyState title="Big empty" description="Lots of space" size="lg" />,
		);
	});

	const h2 = container.querySelector("h2");
	assert.ok(h2, "size=lg should use <h2>");
	await unmount(root);
});

test("EmptyState size=sm uses <h3> heading", async () => {
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<EmptyState title="Small empty" description="Compact" size="sm" />,
		);
	});

	const h3 = container.querySelector("h3");
	assert.ok(h3, "size=sm should use <h3>");
	await unmount(root);
});

test("fixture renders EmptyState", () => {
	const html = renderToStaticMarkup(<StatusFixture />);
	assert.ok(
		html.includes("No hazards identified"),
		"fixture should include EmptyState title",
	);
});

// ── helpers ──────────────────────────────────────────────────────

async function renderEmptyState(): Promise<{
	container: HTMLDivElement;
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
			<EmptyState
				icon="◇"
				title="No hazards identified"
				description="Start by adding a hazard for this process step."
				actionLabel="Add hazard"
				onAction={() => {}}
				size="md"
			/>,
		);
	});

	return { container, root };
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
	return dom;
}

async function unmount(root: Root): Promise<void> {
	await act(async () => {
		root.unmount();
	});
}

type TestDom = {
	window: Window & typeof globalThis;
};
