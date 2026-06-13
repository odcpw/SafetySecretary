import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
	DataDisplayFixture,
	SAMPLE_COLUMNS,
	SAMPLE_ROWS,
} from "../../../src/components/ui/__fixtures__/data-display";
import Table, {
	TableBody,
	TableCell,
	TableHead,
	TableHeaderCell,
	TableRow,
} from "../../../src/components/ui/Table";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

test("Table renders semantic table markup from children", async () => {
	const { container, root } = await renderTable();

	assert.ok(container.querySelector("table"), "should render <table>");
	assert.ok(container.querySelector("thead"), "should render <thead>");
	assert.ok(container.querySelector("tbody"), "should render <tbody>");
	assert.equal(
		container.querySelectorAll("tbody tr").length,
		SAMPLE_ROWS.length,
		"should render caller-provided body rows",
	);

	await unmount(root);
});

test("Table header cells default to scope=col", async () => {
	const { container, root } = await renderTable();
	const headers = container.querySelectorAll('th[scope="col"]');

	assert.equal(headers.length, SAMPLE_COLUMNS.length);

	await unmount(root);
});

test("Table passes through aria row and column counts", async () => {
	const { container, root } = await renderTable();
	const table = container.querySelector("table");

	assert.equal(table?.getAttribute("aria-colcount"), "3");
	assert.equal(table?.getAttribute("aria-rowcount"), "3");

	await unmount(root);
});

test("Table applies primitive sticky and striped token classes", async () => {
	const { container, root } = await renderTable();
	const tableClass = container.querySelector("table")?.className ?? "";

	assert.ok(
		tableClass.includes(
			"[&_tbody_tr:nth-child(even)]:bg-[var(--color-surface)]",
		),
		"striped table should expose token stripe class",
	);
	assert.ok(
		tableClass.includes("[&_thead_th]:sticky"),
		"stickyHeader table should expose sticky header class",
	);

	await unmount(root);
});

test("Table keeps data behavior out of the primitive API", async () => {
	const { container, root } = await renderTable();
	const rows = container.querySelectorAll("tbody tr");

	assert.equal(
		rows[0]?.getAttribute("tabindex"),
		null,
		"primitive rows should not become interactive by default",
	);
	assert.equal(
		rows[0]?.getAttribute("data-row-key"),
		null,
		"primitive rows should not own row-key behavior",
	);

	await unmount(root);
});

test("fixture renders Table section", () => {
	const html = renderToStaticMarkup(<DataDisplayFixture />);

	assert.ok(html.includes("Table"), "fixture should include Table heading");
	assert.ok(
		html.includes("Pallet handling"),
		"fixture should include sample data",
	);
});

async function renderTable(): Promise<{
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
			<Table
				striped
				stickyHeader
				aria-colcount={SAMPLE_COLUMNS.length}
				aria-rowcount={SAMPLE_ROWS.length}
			>
				<TableHead>
					<TableRow>
						{SAMPLE_COLUMNS.map((column) => (
							<TableHeaderCell key={column.key}>
								{column.header}
							</TableHeaderCell>
						))}
					</TableRow>
				</TableHead>
				<TableBody>
					{SAMPLE_ROWS.map((row) => (
						<TableRow key={row.id}>
							<TableCell>{row.name}</TableCell>
							<TableCell>{row.severity}</TableCell>
							<TableCell>{row.status}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>,
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
