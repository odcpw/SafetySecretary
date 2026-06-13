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
import DataTable from "../../../src/components/ui/DataTable";

const { JSDOM } = require("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

type SampleRow = (typeof SAMPLE_ROWS)[number];

const DATA_TABLE_LABELS = {
	empty: "No rows",
	nextPage: "Next page",
	pageStatus: (currentPage: number, pageCount: number) =>
		`Page ${currentPage} of ${pageCount}`,
	previousPage: "Previous page",
};

test("DataTable renders data rows into a table", async () => {
	const { container, root } = await renderDataTable();

	assert.ok(
		container.querySelector("table"),
		"DataTable should render <table>",
	);
	assert.equal(container.querySelectorAll("tbody tr").length, 3);
	assert.ok(container.textContent?.includes("Pallet handling"));

	await unmount(root);
});

test("DataTable supports property row keys", async () => {
	const { container, root } = await renderDataTable({ rowKey: "status" });
	const rows = container.querySelectorAll("tbody tr");

	assert.equal(rows[0]?.getAttribute("data-row-key"), "Open");
	assert.equal(rows[1]?.getAttribute("data-row-key"), "In progress");

	await unmount(root);
});

test("DataTable supports function row keys", async () => {
	const { container, root } = await renderDataTable({
		rowKey: (row) => `${row.name}-${row.severity}`,
	});
	const rows = container.querySelectorAll("tbody tr");

	assert.equal(rows[2]?.getAttribute("data-row-key"), "Ladder use-C");

	await unmount(root);
});

test("DataTable custom cell renderer is used", async () => {
	const { container, root } = await renderDataTable({
		columns: [
			{
				cell: (row) => `[${row.severity}]`,
				header: "Severity",
				key: "severity",
			},
		],
	});
	const cells = container.querySelectorAll("tbody td");

	assert.equal(cells[0]?.textContent, "[B]");

	await unmount(root);
});

test("DataTable rows are click and keyboard selectable", async () => {
	const selected: string[] = [];
	const { container, root, dom } = await renderDataTable({
		onRowSelect: (row) => selected.push(row.id),
	});
	const rows = container.querySelectorAll("tbody tr");

	assert.equal(rows[0]?.getAttribute("tabindex"), "0");

	await act(async () => {
		rows[0]?.dispatchEvent(
			new dom.window.MouseEvent("click", { bubbles: true }),
		);
		rows[1]?.dispatchEvent(
			new dom.window.KeyboardEvent("keydown", {
				bubbles: true,
				key: "Enter",
			}),
		);
		rows[2]?.dispatchEvent(
			new dom.window.KeyboardEvent("keydown", {
				bubbles: true,
				key: " ",
			}),
		);
	});

	assert.deepEqual(selected, ["row-1", "row-2", "row-3"]);

	await unmount(root);
});

test("DataTable shows empty state when no data", async () => {
	const { container, root } = await renderDataTable({ data: [] });

	assert.ok(
		container.textContent?.includes("No rows"),
		"should show empty state message",
	);

	await unmount(root);
});

test("DataTable pagination renders caller-provided labels", async () => {
	const { container, root } = await renderDataTable({
		pagination: {
			onPageChange: () => {},
			page: 1,
			pageSize: 1,
			totalItems: 3,
		},
	});
	const buttons = container.querySelectorAll("button[type='button']");

	assert.equal(buttons.length, 2);
	assert.equal(buttons[0]?.textContent, "Previous page");
	assert.equal(buttons[1]?.textContent, "Next page");
	assert.ok(container.textContent?.includes("Page 1 of 3"));

	await unmount(root);
});

test("DataTable renders caller-provided rows when pagination is present", async () => {
	const { container, root } = await renderDataTable({
		data: [SAMPLE_ROWS[1]],
		pagination: {
			page: 2,
			pageSize: 1,
			totalItems: 3,
		},
	});

	assert.equal(container.querySelectorAll("tbody tr").length, 1);
	assert.ok(container.textContent?.includes("Chemical storage"));
	assert.equal(container.textContent?.includes("Pallet handling"), false);

	await unmount(root);
});

test("DataTable pagination Previous button calls onPageChange", async () => {
	const pages: number[] = [];
	const { container, root } = await renderDataTable({
		pagination: {
			onPageChange: (page) => pages.push(page),
			page: 2,
			pageSize: 1,
			totalItems: 3,
		},
	});
	const buttons = container.querySelectorAll<HTMLButtonElement>(
		"button[type='button']",
	);

	await act(async () => {
		buttons[0]?.click();
	});

	assert.deepEqual(pages, [1]);

	await unmount(root);
});

test("DataTable pagination Previous is disabled on first page", async () => {
	const { container, root } = await renderDataTable({
		pagination: {
			page: 1,
			pageSize: 1,
			totalItems: 3,
		},
	});
	const buttons = container.querySelectorAll<HTMLButtonElement>(
		"button[type='button']",
	);

	assert.equal(buttons[0]?.disabled, true);

	await unmount(root);
});

test("DataTable pagination hides when single page", async () => {
	const { container, root } = await renderDataTable({
		pagination: {
			page: 1,
			pageSize: 10,
			totalItems: 3,
		},
	});
	const buttons = container.querySelectorAll("button[type='button']");

	assert.equal(buttons.length, 0);

	await unmount(root);
});

test("DataTable sets semantic table counts", async () => {
	const { container, root } = await renderDataTable({
		pagination: {
			page: 1,
			pageSize: 10,
			totalItems: 42,
		},
	});
	const table = container.querySelector("table");

	assert.equal(table?.getAttribute("aria-colcount"), "3");
	assert.equal(table?.getAttribute("aria-rowcount"), "42");

	await unmount(root);
});

test("fixture renders DataTable section", () => {
	const html = renderToStaticMarkup(<DataDisplayFixture />);

	assert.ok(
		html.includes("DataTable"),
		"fixture should include DataTable heading",
	);
	assert.ok(
		html.includes("Pallet handling"),
		"fixture should include table data",
	);
});

async function renderDataTable(
	options: {
		columns?: Array<{
			key: keyof SampleRow | string;
			header: string;
			cell?: keyof SampleRow | ((row: SampleRow) => string);
		}>;
		data?: SampleRow[];
		onRowSelect?: (row: SampleRow) => void;
		pagination?: {
			page: number;
			pageSize: number;
			totalItems: number;
			onPageChange?: (page: number) => void;
		};
		rowKey?: keyof SampleRow | ((row: SampleRow) => string | number);
		labels?: typeof DATA_TABLE_LABELS;
	} = {},
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
			<DataTable<SampleRow>
				columns={options.columns ?? SAMPLE_COLUMNS}
				data={options.data ?? SAMPLE_ROWS}
				labels={options.labels ?? DATA_TABLE_LABELS}
				onRowSelect={options.onRowSelect}
				pagination={options.pagination}
				rowKey={options.rowKey ?? "id"}
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
	globals.MouseEvent = dom.window.MouseEvent;
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
