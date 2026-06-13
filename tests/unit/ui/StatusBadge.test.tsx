import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusFixture } from "../../../src/components/ui/__fixtures__/status";
import StatusBadge from "../../../src/components/ui/StatusBadge";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

// ── runtime DOM tests ───────────────────────────────────────────

test("StatusBadge renders a <span> with role=status and aria-live=polite", async () => {
	const { container, root } = await renderStatusBadge("open", "Open");
	const span = container.querySelector("span[role='status']");
	assert.ok(span, "StatusBadge should render <span role='status'>");
	assert.equal(
		span?.getAttribute("aria-live"),
		"polite",
		"should have aria-live='polite'",
	);
	await unmount(root);
});

test("StatusBadge renders a dot prefix with aria-hidden", async () => {
	const { container, root } = await renderStatusBadge("completed", "Done");
	const dot = getStatusDot(container);
	assert.ok(dot, "StatusBadge should have an aria-hidden dot element");
	assert.ok(
		(dot.className ?? "").includes("rounded-full"),
		"dot should be a circle (rounded-full)",
	);
	await unmount(root);
});

test("StatusBadge composes the Badge primitive wrapper", async () => {
	const { container, root } = await renderStatusBadge("open", "Open");
	const badge = container.querySelector("span[role='status']");
	const className = badge?.className ?? "";
	assert.ok(className.includes("rounded-full"), "should keep Badge pill shape");
	assert.ok(className.includes("border"), "should keep Badge border styling");
	assert.ok(
		className.includes("bg-[var(--color-surface)]"),
		"should keep Badge tokenized surface styling",
	);
	assert.ok(
		getStatusDot(container),
		"should still render the status dot prefix",
	);
	await unmount(root);
});

test("StatusBadge renders the label text", async () => {
	const { container, root } = await renderStatusBadge(
		"in-progress",
		"In Progress",
	);
	const text = container.textContent;
	assert.ok(
		text?.includes("In Progress"),
		"StatusBadge should contain the label text",
	);
	await unmount(root);
});

for (const status of ["open", "in-progress", "completed", "blocked"] as const) {
	test(`StatusBadge status=${status} renders dot and label`, async () => {
		const { container, root } = await renderStatusBadge(status, "StatusLabel");
		const dot = getStatusDot(container);
		assert.ok(dot, `${status} should render a dot`);
		assert.ok(
			container.textContent?.includes("StatusLabel"),
			`${status} should render the label`,
		);
		await unmount(root);
	});
}

test("StatusBadge passes through custom className", async () => {
	const { container, root } = await renderStatusBadge(
		"open",
		"Open",
		"custom-sb",
	);
	const span = container.querySelector("span");
	assert.ok(
		(span?.className ?? "").includes("custom-sb"),
		"should pass through className",
	);
	await unmount(root);
});

test("fixture renders all four status variants", () => {
	const html = renderToStaticMarkup(<StatusFixture />);
	assert.ok(html.includes(">Open<"), "fixture should include 'Open'");
	assert.ok(
		html.includes(">In Progress<"),
		"fixture should include 'In Progress'",
	);
	assert.ok(html.includes(">Completed<"), "fixture should include 'Completed'");
	assert.ok(html.includes(">Blocked<"), "fixture should include 'Blocked'");
});

// ── helpers ──────────────────────────────────────────────────────

async function renderStatusBadge(
	status: Parameters<typeof StatusBadge>[number]["status"],
	label: string,
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
			<StatusBadge status={status} label={label} className={extraClass} />,
		);
	});

	return { container, root };
}

function getStatusDot(container: ParentNode): HTMLElement | undefined {
	return [...container.querySelectorAll('[aria-hidden="true"]')].find(
		(element) => (element.className ?? "").includes("rounded-full"),
	) as HTMLElement | undefined;
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
