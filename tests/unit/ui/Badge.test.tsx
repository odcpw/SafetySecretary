import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusFixture } from "../../../src/components/ui/__fixtures__/status";
import Badge from "../../../src/components/ui/Badge";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

// ── runtime DOM tests via JSDOM + react-dom/client ──────────────

test("Badge renders as <span> with tone marker aria-hidden", async () => {
	const { container, root } = await renderBadge("neutral", "Test");
	const span = container.querySelector("span");
	assert.ok(span, "Badge should render a <span>");

	const marker = span?.querySelector("[aria-hidden='true']");
	assert.ok(marker, "Badge should contain an aria-hidden marker");
	assert.ok(
		marker?.textContent?.trim().length > 0,
		"marker should have visible text",
	);

	await unmount(root);
});

for (const [variant, expected] of [
	["neutral", "·"],
	["info", "ℹ"],
	["success", "✓"],
	["warning", "⚠"],
	["error", "✕"],
] as const) {
	test(`Badge variant=${variant} renders marker '${expected}'`, async () => {
		const { container, root } = await renderBadge(variant, "Label");
		const marker = container.querySelector("[aria-hidden='true']");
		assert.equal(
			marker?.textContent?.trim(),
			expected,
			`variant ${variant} should use marker '${expected}'`,
		);
		await unmount(root);
	});
}

test("Badge applies visual classes (no color-only signal)", async () => {
	const { container, root } = await renderBadge("error", "Fail");
	const span = container.querySelector("span");
	const classes = span?.className ?? "";
	assert.ok(
		classes.includes("border-") ||
			classes.includes("bg-") ||
			classes.includes("text-"),
		"Badge should apply visual styling classes",
	);
	const marker = container.querySelector("[aria-hidden='true']");
	assert.ok(marker, "Non-color signal (marker) must be present");
	await unmount(root);
});

test("Badge passes through custom className", async () => {
	const { container, root } = await renderBadge(
		"neutral",
		"Custom",
		"my-custom-badge",
	);
	const span = container.querySelector("span");
	assert.ok(
		(span?.className ?? "").includes("my-custom-badge"),
		"Badge should pass through custom className",
	);
	await unmount(root);
});

test("fixture includes all badge variants", () => {
	const html = renderToStaticMarkup(<StatusFixture />);
	for (const v of ["neutral", "info", "success", "warning", "error"]) {
		assert.ok(
			html.includes(`>${v}<`),
			`Fixture should render Badge variant '${v}'`,
		);
	}
});

// ── helpers ──────────────────────────────────────────────────────

async function renderBadge(
	variant: Parameters<typeof Badge>[number]["variant"],
	children: string,
	extraClass?: string,
): Promise<{ container: HTMLDivElement; root: Root }> {
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<Badge variant={variant} className={extraClass}>
				{children}
			</Badge>,
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
