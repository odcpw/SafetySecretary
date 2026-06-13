"use client";

import type { SidebarNavProps } from "./types";

type SidebarNavItem = SidebarNavProps["items"][number];

const navClassName =
	"w-full border-r border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text)]";
const listClassName = "grid gap-1 p-2";
const linkClassName =
	"flex min-h-9 items-center gap-2 rounded-md px-3 py-2 text-[var(--color-muted)] outline-none transition-colors hover:bg-[var(--color-surface-elev)] hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]";
const activeLinkClassName =
	"bg-[var(--color-surface-elev)] font-medium text-[var(--color-text)] shadow-sm";
const childListClassName =
	"ml-4 grid gap-1 border-l border-[var(--color-border)] pl-2";
const toggleClassName =
	"m-2 min-h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2 text-sm font-medium text-[var(--color-text)] outline-none transition-colors hover:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]";

export function SidebarNav({
	items,
	collapsed = false,
	onToggle,
	className,
	"aria-label": ariaLabel = "Sidebar",
	...navProps
}: SidebarNavProps) {
	return (
		<nav
			{...navProps}
			aria-label={ariaLabel}
			className={cx(navClassName, className)}
		>
			{onToggle && (
				<button
					aria-expanded={!collapsed}
					className={toggleClassName}
					onClick={onToggle}
					type="button"
				>
					{collapsed ? "Expand" : "Collapse"}
				</button>
			)}
			<ul className={listClassName}>
				{items.map((item) => (
					<SidebarNavListItem
						collapsed={collapsed}
						item={item}
						key={item.href}
					/>
				))}
			</ul>
		</nav>
	);
}

export default SidebarNav;

function SidebarNavListItem({
	item,
	collapsed,
}: {
	item: SidebarNavItem;
	collapsed: boolean;
}) {
	const hasChildren = item.children && item.children.length > 0;

	return (
		<li>
			<a
				aria-current={item.active ? "page" : undefined}
				className={cx(linkClassName, item.active && activeLinkClassName)}
				href={item.href}
			>
				{item.icon && <span aria-hidden="true">{item.icon}</span>}
				<span className={collapsed ? "sr-only" : undefined}>{item.label}</span>
			</a>
			{hasChildren && !collapsed && (
				<ul className={childListClassName}>
					{item.children?.map((child) => (
						<SidebarNavListItem
							collapsed={collapsed}
							item={child}
							key={child.href}
						/>
					))}
				</ul>
			)}
		</li>
	);
}

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
