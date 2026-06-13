import Button from "../../ui/Button";
import Table, {
	TableBody,
	TableCell,
	TableHead,
	TableHeaderCell,
	TableRow,
} from "../../ui/Table";
import TableChatLayout from "../TableChatLayout";

const rows = [
	{ id: "row-1", owner: "Alex", status: "Open" },
	{ id: "row-2", owner: "Boris", status: "Review" },
	{ id: "row-3", owner: "Chiara", status: "Done" },
];

export function TableChatLayoutFixture() {
	return (
		<div className="grid gap-8 bg-[var(--color-bg)] p-4 text-[var(--color-text)]">
			<section aria-label="Desktop table chat fixture" className="min-h-[32rem]">
				<TableChatLayout
					aria-label="Table and helper layout"
					chat={<HelperThread />}
					chatControls={<Button variant="ghost">Hide</Button>}
					chatLabel="Helper"
					main={<RowsTable />}
					mainLabel="Rows"
					splitterLabel="Resize helper pane"
				/>
			</section>
			<section aria-label="Hidden helper fixture" className="min-h-80">
				<TableChatLayout
					aria-label="Table layout without helper"
					chat={<HelperThread />}
					chatHidden
					chatLabel="Helper"
					main={<RowsTable />}
					mainLabel="Rows"
					splitterLabel="Resize helper pane"
				/>
			</section>
		</div>
	);
}

function RowsTable() {
	return (
		<Table aria-colcount={3} aria-rowcount={rows.length} striped stickyHeader>
			<TableHead>
				<TableRow>
					<TableHeaderCell>ID</TableHeaderCell>
					<TableHeaderCell>Owner</TableHeaderCell>
					<TableHeaderCell>Status</TableHeaderCell>
				</TableRow>
			</TableHead>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.id}>
						<TableCell>{row.id}</TableCell>
						<TableCell>{row.owner}</TableCell>
						<TableCell>{row.status}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

function HelperThread() {
	return (
		<div className="grid gap-3 text-sm">
			<p className="rounded-md bg-[var(--color-surface-elev)] p-3">
				What changed since the last review?
			</p>
			<p className="rounded-md border border-[var(--color-border)] p-3 text-[var(--color-muted)]">
				Three rows need attention before handoff.
			</p>
		</div>
	);
}

export default TableChatLayoutFixture;
