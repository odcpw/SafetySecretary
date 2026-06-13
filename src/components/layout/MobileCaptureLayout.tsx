"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";

export interface MobileCaptureLayoutProps
	extends Omit<ComponentPropsWithoutRef<"section">, "children" | "title"> {
	title: ReactNode;
	children: ReactNode;
	actions: ReactNode;
	headerAction?: ReactNode;
	meta?: ReactNode;
	"aria-label"?: string;
}

const rootClassName =
	"flex min-h-dvh w-full max-w-full flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)]";
const headerClassName =
	"shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3";
const contentClassName =
	"min-h-0 max-w-full flex-1 overflow-y-auto px-4 py-4";
const actionBarClassName =
	"sticky bottom-0 shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 py-3 backdrop-blur";
const actionSlotClassName =
	"flex min-h-11 w-full items-center justify-end gap-2 [&>a]:min-h-11 [&>a]:min-w-11 [&>button]:min-h-11 [&>button]:min-w-11";

export function MobileCaptureLayout({
	title,
	children,
	actions,
	headerAction,
	meta,
	className,
	"aria-label": ariaLabel = "Mobile capture",
	...sectionProps
}: MobileCaptureLayoutProps) {
	return (
		<section
			{...sectionProps}
			aria-label={ariaLabel}
			className={cx(rootClassName, className)}
		>
			<header className={headerClassName}>
				<div className="flex min-h-11 min-w-0 items-center justify-between gap-3">
					<div className="min-w-0">
						<h1 className="truncate text-base font-semibold">{title}</h1>
						{meta && (
							<div className="truncate text-xs text-[var(--color-muted)]">
								{meta}
							</div>
						)}
					</div>
					{headerAction && (
						<div className="flex min-h-11 shrink-0 items-center [&>a]:min-h-11 [&>a]:min-w-11 [&>button]:min-h-11 [&>button]:min-w-11">
							{headerAction}
						</div>
					)}
				</div>
			</header>
			<div className={contentClassName}>{children}</div>
			<footer
				aria-label="Capture actions"
				className={actionBarClassName}
				role="toolbar"
			>
				<div className={actionSlotClassName}>{actions}</div>
			</footer>
		</section>
	);
}

export default MobileCaptureLayout;

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
