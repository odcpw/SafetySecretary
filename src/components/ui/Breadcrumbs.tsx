import type { BreadcrumbsProps } from "./types";

type BreadcrumbItem = BreadcrumbsProps["items"][number];
type VisibleCrumb =
	| { kind: "item"; item: BreadcrumbItem; sourceIndex: number }
	| { kind: "ellipsis"; key: string };

const navClassName = "text-sm text-[var(--color-muted)]";
const listClassName = "flex flex-wrap items-center gap-2";
const linkClassName =
	"rounded-sm text-[var(--color-muted)] outline-none transition-colors hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]";
const currentClassName = "font-medium text-[var(--color-text)]";
const separatorClassName = "text-[var(--color-muted)]";

export function Breadcrumbs({
	items,
	maxItems,
	separator = "/",
	className,
	"aria-label": ariaLabel = "Breadcrumb",
	...navProps
}: BreadcrumbsProps) {
	const visibleItems = visibleCrumbs(items, maxItems);
	const currentIndex = currentCrumbIndex(items);

	return (
		<nav
			{...navProps}
			aria-label={ariaLabel}
			className={cx(navClassName, className)}
		>
			<ol className={listClassName}>
				{visibleItems.map((crumb, visibleIndex) => (
					<li className="flex items-center gap-2" key={crumbKey(crumb)}>
						{visibleIndex > 0 && (
							<span aria-hidden="true" className={separatorClassName}>
								{separator}
							</span>
						)}
						{crumb.kind === "ellipsis" ? (
							<span aria-hidden="true" className={separatorClassName}>
								...
							</span>
						) : (
							<BreadcrumbLabel
								isCurrent={crumb.sourceIndex === currentIndex}
								item={crumb.item}
							/>
						)}
					</li>
				))}
			</ol>
		</nav>
	);
}

export default Breadcrumbs;

function BreadcrumbLabel({
	item,
	isCurrent,
}: {
	item: BreadcrumbItem;
	isCurrent: boolean;
}) {
	if (isCurrent) {
		return (
			<span aria-current="page" className={currentClassName}>
				{item.label}
			</span>
		);
	}

	return (
		<a className={linkClassName} href={item.href}>
			{item.label}
		</a>
	);
}

function currentCrumbIndex(items: readonly BreadcrumbItem[]): number {
	const explicitIndex = items.findIndex((item) => item.isCurrent);
	return explicitIndex >= 0 ? explicitIndex : items.length - 1;
}

function visibleCrumbs(
	items: readonly BreadcrumbItem[],
	maxItems: number | undefined,
): VisibleCrumb[] {
	if (!maxItems || items.length <= maxItems || maxItems < 2) {
		return items.map((item, sourceIndex) => ({
			kind: "item",
			item,
			sourceIndex,
		}));
	}

	const tailCount = Math.max(1, maxItems - 2);
	const tailStart = items.length - tailCount;
	return [
		{ kind: "item", item: items[0], sourceIndex: 0 },
		{ kind: "ellipsis", key: "ellipsis" },
		...items.slice(tailStart).map((item, offset) => ({
			kind: "item" as const,
			item,
			sourceIndex: tailStart + offset,
		})),
	];
}

function crumbKey(crumb: VisibleCrumb): string {
	return crumb.kind === "ellipsis" ? crumb.key : crumb.item.href;
}

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
