import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusFixture } from "../../../src/components/ui/__fixtures__/status";
import LoadingState from "../../../src/components/ui/LoadingState";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

// ── runtime DOM tests ───────────────────────────────────────────

test("LoadingState spinner has role=status and aria-live=polite", async () => {
	const { container, root } = await renderLoadingState("spinner");
	const status = container.querySelector('[role="status"]');
	assert.ok(status, "LoadingState should have role='status'");
	assert.equal(
		status?.getAttribute("aria-live"),
		"polite",
		"should have aria-live='polite'",
	);
	assert.equal(
		status?.getAttribute("aria-busy"),
		"true",
		"should have aria-busy='true'",
	);
	await unmount(root);
});

test("LoadingState spinner renders an SVG with aria-hidden", async () => {
	const { container, root } = await renderLoadingState("spinner");
	const svg = container.querySelector('svg[aria-hidden="true"]');
	assert.ok(svg, "spinner should render an SVG with aria-hidden='true'");
	assert.ok(
		[...(svg.classList ?? [])].includes("animate-spin"),
		"spinner SVG should have animate-spin class",
	);
	await unmount(root);
});

test("LoadingState skeleton renders skeleton rows", async () => {
	const { container, root } = await renderLoadingState("skeleton", 5);
	const bars = container.querySelectorAll('[aria-hidden="true"]');
	assert.equal(
		bars.length,
		5,
		"skeleton should render exactly `rows` skeleton bars",
	);
	await unmount(root);
});

test("LoadingState skeleton bars have animate-pulse class", async () => {
	const { container, root } = await renderLoadingState("skeleton", 3);
	const bars = container.querySelectorAll('[aria-hidden="true"]');
	for (const bar of bars) {
		assert.ok(
			(bar.className ?? "").includes("animate-pulse"),
			"each skeleton bar should have animate-pulse class",
		);
	}
	await unmount(root);
});

test("LoadingState skeleton last bar is shorter (w-2/3)", async () => {
	const { container, root } = await renderLoadingState("skeleton", 4);
	const bars = container.querySelectorAll('[aria-hidden="true"]');
	const lastBar = bars[bars.length - 1];
	assert.ok(
		(lastBar?.className ?? "").includes("w-2/3"),
		"last skeleton bar should be shorter (w-2/3)",
	);
	// all others should be w-full
	for (let i = 0; i < bars.length - 1; i++) {
		assert.ok(
			(bars[i].className ?? "").includes("w-full"),
			`bar ${i} should be w-full`,
		);
	}
	await unmount(root);
});

test("LoadingState skeleton has role=status and aria-busy", async () => {
	const { container, root } = await renderLoadingState("skeleton", 3);
	const status = container.querySelector('[role="status"]');
	assert.ok(status, "skeleton LoadingState should have role='status'");
	assert.equal(status?.getAttribute("aria-busy"), "true");
	await unmount(root);
});

test("LoadingState fullscreen adds min-h class", async () => {
	const { container, root } = await renderLoadingState(
		"spinner",
		undefined,
		true,
	);
	const el = container.querySelector('[role="status"]');
	assert.ok(
		(el?.className ?? "").includes("min-h-"),
		"fullscreen should add min-h class",
	);
	await unmount(root);
});

test("fixture renders LoadingState section", () => {
	const html = renderToStaticMarkup(<StatusFixture />);
	assert.ok(
		html.includes("LoadingState") || html.includes('role="status"'),
		"fixture should include LoadingState",
	);
});

// ── helpers ──────────────────────────────────────────────────────

async function renderLoadingState(
	variant: Parameters<typeof LoadingState>[number]["variant"],
	rows?: number,
	fullscreen?: boolean,
): Promise<{ container: HTMLDivElement; root: Root }> {
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<LoadingState variant={variant} rows={rows} fullscreen={fullscreen} />,
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
