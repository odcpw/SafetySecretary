"use client";

import type { ComponentPropsWithoutRef, KeyboardEvent, ReactNode } from "react";

type CardInnerProps = Omit<
	ComponentPropsWithoutRef<"section">,
	"children" | "title" | "onClick"
> & {
	title?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	interactive?: boolean;
	selected?: boolean;
	onClick?: () => void;
};

export default function Card({
	title,
	children,
	footer,
	interactive,
	selected,
	className = "",
	onClick,
	onKeyDown,
	...rest
}: CardInnerProps) {
	const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
		onKeyDown?.(e);
		if (interactive && (e.key === "Enter" || e.key === " ")) {
			e.preventDefault();
			onClick?.();
		}
	};

	const baseAttrs = {
		tabIndex: interactive ? 0 : undefined,
		role: interactive ? ("button" as const) : undefined,
	};

	const interactiveHandlers = interactive
		? {
				onClick: () => onClick?.(),
				onKeyDown: handleKeyDown,
			}
		: { onKeyDown: onKeyDown ? handleKeyDown : undefined };

	return (
		<section
			{...baseAttrs}
			{...interactiveHandlers}
			className={[
				"flex flex-col rounded-lg border bg-[var(--color-surface)]",
				interactive
					? "cursor-pointer border-[var(--color-border)] outline-none transition-colors hover:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
					: "border-[var(--color-border)]",
				selected &&
					"border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]",
				className,
			].join(" ")}
			{...rest}
		>
			{title && (
				<div className="border-b border-[var(--color-border)] px-4 py-3">
					<h3 className="m-0 text-sm font-medium text-[var(--color-text)]">
						{title}
					</h3>
				</div>
			)}
			<div className="px-4 py-3">{children}</div>
			{footer && (
				<div className="border-t border-[var(--color-border)] px-4 py-3">
					{footer}
				</div>
			)}
		</section>
	);
}
