"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";

type StickyActionBarPosition = "auto" | "top" | "bottom";

export interface StickyActionBarProps
	extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
	"aria-label": string;
	primaryAction: ReactNode;
	secondaryAction?: ReactNode;
	meta?: ReactNode;
	position?: StickyActionBarPosition;
}

const baseClassName =
	"fixed inset-x-0 z-40 border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 py-3 text-[var(--color-text)] shadow-sm backdrop-blur";

const positionClassNames: Record<StickyActionBarPosition, string> = {
	auto: "bottom-0 border-t lg:top-0 lg:bottom-auto lg:border-t-0 lg:border-b",
	top: "top-0 border-b",
	bottom: "bottom-0 border-t",
};

const innerClassName =
	"mx-auto flex min-h-11 w-full max-w-screen-2xl items-center justify-between gap-3";
const actionSlotClassName =
	"flex min-h-11 min-w-0 items-center gap-2 [&>a]:min-h-11 [&>a]:min-w-11 [&>button]:min-h-11 [&>button]:min-w-11";

export function StickyActionBar({
	"aria-label": ariaLabel,
	primaryAction,
	secondaryAction,
	meta,
	position = "auto",
	className,
	...barProps
}: StickyActionBarProps) {
	return (
		<div
			{...barProps}
			aria-label={ariaLabel}
			className={cx(baseClassName, positionClassNames[position], className)}
			role="toolbar"
		>
			<div className={innerClassName}>
				<div className={cx(actionSlotClassName, "justify-start")}>
					{secondaryAction}
				</div>
				{meta && (
					<div className="min-w-0 flex-1 truncate text-center text-xs text-[var(--color-muted)]">
						{meta}
					</div>
				)}
				<div className={cx(actionSlotClassName, "justify-end")}>
					{primaryAction}
				</div>
			</div>
		</div>
	);
}

export default StickyActionBar;

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
