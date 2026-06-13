import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusFixture } from "../../../src/components/ui/__fixtures__/status";
import ErrorState from "../../../src/components/ui/ErrorState";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

// ── runtime DOM tests ───────────────────────────────────────────

test("ErrorState renders a <section> with role=alert", async () => {
	const { container, root } = await renderErrorState();
	const section = container.querySelector('section[role="alert"]');
	assert.ok(section, "ErrorState should render <section role='alert'>");
	await unmount(root);
});

test("ErrorState renders title and message", async () => {
	const { container, root } = await renderErrorState();
	assert.ok(
		container.textContent?.includes("Unable to load"),
		"should render the title",
	);
	assert.ok(
		container.textContent?.includes("Try again"),
		"should render the message",
	);
	await unmount(root);
});

test("ErrorState renders retry button when onRetry provided", async () => {
	const { container, root } = await renderErrorState();
	const button = container.querySelector("button");
	assert.ok(button, "ErrorState should render a retry <button>");
	assert.equal(button?.textContent, "Retry", "button should show retryLabel");
	await unmount(root);
});

test("ErrorState retry button fires onRetry onClick", async () => {
	let fired = false;
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<ErrorState
				title="Error"
				message="Something went wrong"
				onRetry={() => {
					fired = true;
				}}
			/>,
		);
	});

	const button = container.querySelector("button");
	await act(async () => {
		button?.click();
	});

	assert.ok(fired, "onRetry should be called on button click");
	await unmount(root);
});

test("ErrorState omits retry button when onRetry missing", async () => {
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(<ErrorState title="Error" message="Something went wrong" />);
	});

	const button = container.querySelector("button");
	assert.equal(button, null, "no retry button when onRetry is absent");
	await unmount(root);
});

test("ErrorState renders error icon with aria-hidden", async () => {
	const { container, root } = await renderErrorState();
	const icon = container.querySelector('[aria-hidden="true"]');
	assert.ok(icon, "error icon should have aria-hidden='true'");
	await unmount(root);
});

test("ErrorState renders error code in <code> element", async () => {
	const { container, root } = await renderErrorState();
	const code = container.querySelector("code");
	assert.ok(code, "ErrorState should render a <code> for error code");
	assert.equal(code?.textContent, "fetch_failed", "code text should match");
	await unmount(root);
});

test("ErrorState renders details text", async () => {
	const { container, root } = await renderErrorState();
	assert.ok(
		container.textContent?.includes("could not be loaded"),
		"ErrorState should render details text",
	);
	await unmount(root);
});

test("ErrorState custom retryLabel is rendered", async () => {
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } =
		require("react-dom/client") as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<ErrorState
				title="Error"
				message="Failed"
				retryLabel="Try again"
				onRetry={() => {}}
			/>,
		);
	});

	const button = container.querySelector("button");
	assert.equal(
		button?.textContent,
		"Try again",
		"button should use custom retryLabel",
	);
	await unmount(root);
});

test("fixture renders ErrorState section", () => {
	const html = renderToStaticMarkup(<StatusFixture />);
	assert.ok(
		html.includes("Unable to load HIRA"),
		"fixture should include ErrorState title",
	);
});

// ── helpers ──────────────────────────────────────────────────────

async function renderErrorState(): Promise<{
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
			<ErrorState
				title="Unable to load HIRA"
				message="Try again in a moment."
				code="fetch_failed"
				details="The HIRA could not be loaded."
				retryLabel="Retry"
				onRetry={() => {}}
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
