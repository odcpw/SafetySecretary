"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";

export interface TopBarProps
	extends Omit<
		ComponentPropsWithoutRef<"header">,
		"children" | "content" | "title"
	> {
	brand?: ReactNode;
	content?: ReactNode;
	actions?: ReactNode;
	children?: ReactNode;
	title?: ReactNode;
	searchPlaceholder?: string;
	notifications?: ReactNode;
	userMenu?: ReactNode;
	onSearch?: (query: string) => void;
}

const headerClassName =
	"sticky top-0 z-10 flex min-h-14 items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 text-sm text-[var(--color-text)]";
const brandClassName =
	"min-w-0 shrink-0 font-semibold text-[var(--color-text)]";
const contentClassName = "min-w-0 flex-1";
const actionsClassName = "flex shrink-0 items-center gap-2";
const searchClassName =
	"min-h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-muted)] hover:border-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]";

export function TopBar({
	brand,
	content,
	actions,
	children,
	title,
	searchPlaceholder,
	notifications,
	userMenu,
	onSearch,
	className,
	...headerProps
}: TopBarProps) {
	const resolvedBrand = brand ?? title;
	const resolvedContent =
		content ??
		children ??
		(onSearch || searchPlaceholder ? (
			<input
				aria-label="Search"
				className={searchClassName}
				onChange={(event) => onSearch?.(event.currentTarget.value)}
				placeholder={searchPlaceholder ?? "Search"}
				type="search"
			/>
		) : null);

	return (
		<header {...headerProps} className={cx(headerClassName, className)}>
			{resolvedBrand && <div className={brandClassName}>{resolvedBrand}</div>}
			{resolvedContent && (
				<div className={contentClassName}>{resolvedContent}</div>
			)}
			{(actions || notifications || userMenu) && (
				<div className={actionsClassName}>
					{actions}
					{notifications}
					{userMenu}
				</div>
			)}
		</header>
	);
}

export default TopBar;

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
