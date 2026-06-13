"use client";

import { forwardRef } from "react";
import type { IconButtonProps } from "./types";

const baseClassName =
	"inline-flex shrink-0 items-center justify-center rounded-md border text-[var(--color-text)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-60";

const variantClassNames: Record<
	NonNullable<IconButtonProps["variant"]>,
	string
> = {
	default:
		"border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elev)]",
	ghost:
		"border-transparent bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
};

const sizeClassNames: Record<NonNullable<IconButtonProps["size"]>, string> = {
	sm: "size-8 text-xs",
	md: "size-10 text-sm",
	lg: "size-11 text-base",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
	function IconButton(
		{
			icon,
			disabled = false,
			size = "md",
			variant = "default",
			className,
			type = "button",
			...buttonProps
		},
		ref,
	) {
		return (
			<button
				{...buttonProps}
				aria-disabled={disabled || undefined}
				className={cx(
					baseClassName,
					variantClassNames[variant],
					sizeClassNames[size],
					className,
				)}
				disabled={disabled}
				ref={ref}
				type={type}
			>
				<span aria-hidden="true" className="inline-flex">
					{icon}
				</span>
			</button>
		);
	},
);

export default IconButton;

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
