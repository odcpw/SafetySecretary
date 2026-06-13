"use client";

import type { ReactNode } from "react";
import type { DataTableProps } from "./types";
import Table, {
	TableBody,
	TableCell,
	TableHead,
	TableHeaderCell,
	TableRow,
} from "./Table";

type DataTableColumn<Row> = DataTableProps<Row>["columns"][number];
type DataTableRowKey<Row> = DataTableProps<Row>["rowKey"];

export default function DataTable<Row = Record<string, unknown>>({
	columns,
	data,
	labels,
	rowKey,
	pagination,
	onRowSelect,
	loading,
	className = "",
	...containerProps
}: DataTableProps<Row>) {
	const pageCount = pagination
		? Math.max(1, Math.ceil(pagination.totalItems / pagination.pageSize))
		: 0;
	const currentPage = pagination?.page ?? 1;

	return (
		<div
			{...containerProps}
			className={cx("overflow-hidden rounded-lg", className)}
		>
			<div className="overflow-x-auto border border-[var(--color-border)]">
				<Table
					aria-colcount={columns.length}
					aria-rowcount={pagination ? pagination.totalItems : data.length}
					striped
					stickyHeader
				>
					<TableHead>
						<TableRow>
							{columns.map((column) => (
								<TableHeaderCell
									className={column.className}
									key={String(column.key)}
								>
									{column.header}
								</TableHeaderCell>
							))}
						</TableRow>
					</TableHead>
					<TableBody>
						{data.map((row) => {
							const keyValue = rowKeyValue(rowKey, row);
							return (
								<TableRow
									className={
										onRowSelect
											? "cursor-pointer hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
											: undefined
									}
									data-row-key={String(keyValue)}
									key={String(keyValue)}
									onClick={() => onRowSelect?.(row)}
									onKeyDown={(event) => {
										if (
											onRowSelect &&
											(event.key === "Enter" || event.key === " ")
										) {
											event.preventDefault();
											onRowSelect(row);
										}
									}}
									tabIndex={onRowSelect ? 0 : undefined}
								>
									{columns.map((column) => (
										<TableCell
											className={column.className}
											key={String(column.key)}
										>
											{cellContent(column, row)}
										</TableCell>
									))}
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>

			{data.length === 0 && !loading && (
				<div className="flex items-center justify-center py-8 text-sm text-[var(--color-muted)]">
					{labels.empty}
				</div>
			)}

			{pagination && pageCount > 1 && (
				<div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-3">
					<span className="text-sm text-[var(--color-muted)]">
						{labels.pageStatus(currentPage, pageCount)}
					</span>
					<div className="flex gap-2">
						<button
							className="rounded border border-[var(--color-border)] px-3 py-1 text-sm text-[var(--color-text)] outline-none disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[var(--color-surface)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
							disabled={currentPage <= 1}
							onClick={() => pagination?.onPageChange?.(currentPage - 1)}
							type="button"
						>
							{labels.previousPage}
						</button>
						<button
							className="rounded border border-[var(--color-border)] px-3 py-1 text-sm text-[var(--color-text)] outline-none disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[var(--color-surface)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
							disabled={currentPage >= pageCount}
							onClick={() => pagination?.onPageChange?.(currentPage + 1)}
							type="button"
						>
							{labels.nextPage}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

function rowKeyValue<Row>(
	rowKey: DataTableRowKey<Row>,
	row: Row,
): string | number {
	if (typeof rowKey === "function") {
		return rowKey(row);
	}

	const value = row[rowKey];
	if (typeof value === "string" || typeof value === "number") {
		return value;
	}

	return String(value);
}

function cellContent<Row>(column: DataTableColumn<Row>, row: Row): ReactNode {
	if (typeof column.cell === "function") {
		return column.cell(row);
	}

	const key = column.cell ?? column.key;
	const value = row[key as keyof Row];

	return value !== null && value !== undefined ? String(value) : "";
}

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
