"use client";

import Card from "../Card";
import DataTable from "../DataTable";
import Table, {
	TableBody,
	TableCell,
	TableHead,
	TableHeaderCell,
	TableRow,
} from "../Table";

export type SampleRow = {
	id: string;
	name: string;
	severity: string;
	status: string;
};

export const SAMPLE_ROWS: SampleRow[] = [
	{ id: "row-1", name: "Pallet handling", severity: "B", status: "Open" },
	{
		id: "row-2",
		name: "Chemical storage",
		severity: "A",
		status: "In progress",
	},
	{ id: "row-3", name: "Ladder use", severity: "C", status: "Completed" },
];

export const SAMPLE_COLUMNS = [
	{ key: "name", header: "Activity" },
	{ key: "severity", header: "Severity" },
	{
		key: "status",
		header: "Status",
		cell: (row: SampleRow) => row.status,
	},
];

export function DataDisplayFixture() {
	return (
		<div className="flex flex-col gap-8 p-4">
			{/* Table */}
			<section aria-labelledby="table-heading">
				<h2 id="table-heading" className="mb-2 text-lg font-semibold">
					Table
				</h2>
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
				</Table>
			</section>

			{/* DataTable */}
			<section aria-labelledby="datatable-heading">
				<h2 id="datatable-heading" className="mb-2 text-lg font-semibold">
					DataTable
				</h2>
				<DataTable<SampleRow>
					columns={SAMPLE_COLUMNS}
					data={SAMPLE_ROWS}
					labels={{
						empty: "No rows",
						nextPage: "Next page",
						pageStatus: (currentPage, pageCount) =>
							`Page ${currentPage} of ${pageCount}`,
						previousPage: "Previous page",
					}}
					pagination={{
						page: 1,
						pageSize: 10,
						totalItems: 3,
					}}
					rowKey="id"
				/>
			</section>

			{/* Card */}
			<section aria-labelledby="card-heading">
				<h2 id="card-heading" className="mb-2 text-lg font-semibold">
					Card
				</h2>
				<div className="flex flex-wrap gap-4">
					<Card title="HIRA Summary">
						<p className="m-0 text-sm text-[var(--color-muted)]">
							3 hazards identified
						</p>
					</Card>
					<Card title="Interactive Card" interactive onClick={() => {}}>
						<p className="m-0 text-sm text-[var(--color-muted)]">
							Click to open details
						</p>
						<footer>Updated today</footer>
					</Card>
					<Card title="Selected Card" selected>
						<p className="m-0 text-sm text-[var(--color-muted)]">
							This card is selected
						</p>
					</Card>
				</div>
			</section>
		</div>
	);
}
