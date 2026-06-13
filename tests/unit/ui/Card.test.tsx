import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { DataDisplayFixture } from "../../../src/components/ui/__fixtures__/data-display";
import Card from "../../../src/components/ui/Card";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

// ── runtime DOM tests ───────────────────────────────────────────

test("Card renders a <section> with body content", async () => {
	const { container, root } = await renderCard({ title: "Summary" });
	assert.ok(container.querySelector("section"), "Card should render <section>");
	assert.ok(
		container.textContent?.includes("Body text"),
		"Card should render body children",
	);
	await unmount(root);
});

test("Card renders optional title in heading", async () => {
	const { container, root } = await renderCard({ title: "HIRA Summary" });
	const heading = container.querySelector("h3");
	assert.ok(heading, "Card with title should render <h3>");
	assert.ok(
		heading?.textContent?.includes("HIRA Summary"),
		"heading text should match title",
	);
	await unmount(root);
});

test("Card renders optional footer slot", async () => {
	const { container, root } = await renderCard({
		title: "Card",
		footer: "Updated today",
	});
	/* Footer is rendered as a div with border-t */
	const sections = container.querySelectorAll("div.border-t");
	assert.ok(
		sections.length > 0 && sections[0]?.textContent?.includes("Updated today"),
		"Card should render footer content",
	);
	await unmount(root);
});

test("Card without title omits header", async () => {
	const { container, root } = await renderCard({ title: undefined });
	const heading = container.querySelector("h3");
	assert.equal(heading, null, "Card without title should not render <h3>");
	await unmount(root);
});

test("Interactive Card has tabindex=0 and role=button", async () => {
	let clicked = false;
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<Card
				title="Click me"
				interactive
				onClick={() => {
					clicked = true;
				}}
			>
				Body
			</Card>,
		);
	});

	const section = container.querySelector("section");
	assert.equal(
		section?.getAttribute("tabindex"),
		"0",
		"interactive Card should have tabindex=0",
	);
	assert.equal(
		section?.getAttribute("role"),
		"button",
		"interactive Card should have role=button",
	);

	/* Click triggers onClick */
	await act(async () => {
		section?.click();
	});
	assert.ok(clicked, "onClick should fire on interactive Card click");

	await unmount(root);
});

test("Interactive Card responds to Enter key", async () => {
	let clicked = false;
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<Card
				title="Press Enter"
				interactive
				onClick={() => {
					clicked = true;
				}}
			>
				Body
			</Card>,
		);
	});

	const section = container.querySelector("section");
	await act(async () => {
		const event = new dom.window.KeyboardEvent("keydown", {
			bubbles: true,
			key: "Enter",
		});
		section?.dispatchEvent(event);
	});
	assert.ok(clicked, "Enter should trigger onClick on interactive Card");

	await unmount(root);
});

test("Interactive Card responds to Space key", async () => {
	let clicked = false;
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<Card
				title="Press Space"
				interactive
				onClick={() => {
					clicked = true;
				}}
			>
				Body
			</Card>,
		);
	});

	const section = container.querySelector("section");
	await act(async () => {
		const event = new dom.window.KeyboardEvent("keydown", {
			bubbles: true,
			key: " ",
		});
		section?.dispatchEvent(event);
	});
	assert.ok(clicked, "Space should trigger onClick on interactive Card");

	await unmount(root);
});

test("Non-interactive Card has no tabindex or role", async () => {
	const { container, root } = await renderCard({ title: "Static" });
	const section = container.querySelector("section");
	assert.equal(
		section?.getAttribute("tabindex"),
		null,
		"non-interactive Card should not have tabindex",
	);
	assert.equal(
		section?.getAttribute("role"),
		null,
		"non-interactive Card should not have role",
	);
	await unmount(root);
});

test("Card selected state adds visual indicator", async () => {
	const { container, root } = await renderCard({
		title: "Selected",
		selected: true,
	});
	const section = container.querySelector("section");
	const classes = section?.className ?? "";
	assert.ok(classes.includes("ring"), "selected Card should have ring class");
	await unmount(root);
});

test("Card passes through custom className", async () => {
	const { container, root } = await renderCard({
		title: "Custom",
		className: "my-custom-card",
	});
	const section = container.querySelector("section");
	assert.ok(
		(section?.className ?? "").includes("my-custom-card"),
		"Card should pass through custom className",
	);
	await unmount(root);
});

test("fixture renders Card section", () => {
	const html = renderToStaticMarkup(<DataDisplayFixture />);
	assert.ok(html.includes("Card"), "fixture should include Card heading");
	assert.ok(
		html.includes("HIRA Summary"),
		"fixture should include Card content",
	);
});

// ── helpers ──────────────────────────────────────────────────────

async function renderCard(opts: {
	title?: string;
	footer?: string;
	interactive?: boolean;
	selected?: boolean;
	className?: string;
}): Promise<{ container: HTMLDivElement; root: Root }> {
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<Card
				title={opts.title}
				footer={opts.footer}
				interactive={opts.interactive}
				selected={opts.selected}
				className={opts.className}
				onClick={opts.interactive ? () => {} : undefined}
			>
				Body text
			</Card>,
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
	globals.KeyboardEvent = dom.window.KeyboardEvent;
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
