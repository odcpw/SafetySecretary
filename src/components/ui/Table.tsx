"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";

type CompactSize = "sm" | "md";

type TableProps = Omit<ComponentPropsWithoutRef<"table">, "children"> & {
	children: ReactNode;
	striped?: boolean;
	stickyHeader?: boolean;
	size?: CompactSize;
	wrapperClassName?: string;
};

type TableSectionProps = ComponentPropsWithoutRef<"thead"> & {
	children: ReactNode;
};

type TableBodyProps = ComponentPropsWithoutRef<"tbody"> & {
	children: ReactNode;
};

type TableRowProps = ComponentPropsWithoutRef<"tr"> & {
	children: ReactNode;
};

type TableCellProps = ComponentPropsWithoutRef<"td"> & {
	children: ReactNode;
};

type TableHeaderCellProps = ComponentPropsWithoutRef<"th"> & {
	children: ReactNode;
};

export default function Table({
	children,
	striped = false,
	stickyHeader = false,
	size = "md",
	className = "",
	wrapperClassName = "",
	...tableProps
}: TableProps) {
	return (
		<div className={cx("overflow-x-auto", wrapperClassName)}>
			<table
				{...tableProps}
				className={cx(
					"w-full border-separate border-spacing-0 text-[var(--color-text)]",
					size === "sm" ? "text-xs" : "text-sm",
					striped && "[&_tbody_tr:nth-child(even)]:bg-[var(--color-surface)]",
					stickyHeader &&
						"[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:bg-[var(--color-bg)]",
					className,
				)}
			>
				{children}
			</table>
		</div>
	);
}

export function TableHead({
	children,
	className = "",
	...headProps
}: TableSectionProps) {
	return (
		<thead
			{...headProps}
			className={cx("border-b border-[var(--color-border)]", className)}
		>
			{children}
		</thead>
	);
}

export function TableBody({
	children,
	className = "",
	...bodyProps
}: TableBodyProps) {
	return (
		<tbody {...bodyProps} className={className}>
			{children}
		</tbody>
	);
}

export function TableRow({
	children,
	className = "",
	...rowProps
}: TableRowProps) {
	return (
		<tr
			{...rowProps}
			className={cx("border-b border-[var(--color-border)]", className)}
		>
			{children}
		</tr>
	);
}

export function TableHeaderCell({
	children,
	className = "",
	scope = "col",
	...headerCellProps
}: TableHeaderCellProps) {
	return (
		<th
			{...headerCellProps}
			className={cx(
				"whitespace-nowrap px-3 py-2 text-left font-medium text-[var(--color-muted)]",
				className,
			)}
			scope={scope}
		>
			{children}
		</th>
	);
}

export function TableCell({
	children,
	className = "",
	...cellProps
}: TableCellProps) {
	return (
		<td {...cellProps} className={cx("px-3 py-2 align-top", className)}>
			{children}
		</td>
	);
}

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
