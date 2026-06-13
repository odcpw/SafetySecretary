"use client";

import { forwardRef } from "react";
import type { ButtonProps } from "./types";

const baseClassName =
	"inline-flex min-w-0 items-center justify-center gap-2 rounded-md border text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-60";

const variantClassNames: Record<NonNullable<ButtonProps["variant"]>, string> = {
	primary:
		"border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-bg)] hover:opacity-90",
	secondary:
		"border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elev)]",
	ghost:
		"border-transparent bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
	destructive:
		"border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elev)]",
};

const sizeClassNames: Record<NonNullable<ButtonProps["size"]>, string> = {
	sm: "min-h-8 px-2.5 py-1.5 text-xs",
	md: "min-h-10 px-3 py-2 text-sm",
	lg: "min-h-11 px-4 py-2.5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	function Button(
		{
			variant = "primary",
			size = "md",
			disabled = false,
			loading = false,
			children,
			className,
			type = "button",
			"aria-busy": ariaBusy,
			...buttonProps
		},
		ref,
	) {
		const isDisabled = disabled || loading;

		return (
			<button
				{...buttonProps}
				aria-busy={loading || ariaBusy || undefined}
				aria-disabled={isDisabled || undefined}
				className={cx(
					baseClassName,
					variantClassNames[variant],
					sizeClassNames[size],
					className,
				)}
				disabled={isDisabled}
				ref={ref}
				type={type}
			>
				{loading && (
					<span
						aria-hidden="true"
						className="size-3 rounded-full border border-current border-t-transparent"
					/>
				)}
				<span className="truncate">{children}</span>
			</button>
		);
	},
);

export default Button;

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
