"use client";

import { type ComponentPropsWithoutRef, useId } from "react";
import type { SelectProps } from "./types";

const fieldClassName =
	"min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] shadow-sm outline-none transition-colors hover:border-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-60";

export function Select({
	label,
	options,
	value,
	onChange,
	disabled,
	error,
	placeholder,
	className,
	id,
	...props
}: SelectProps) {
	const generatedId = useId();
	const selectId = id ?? `select-${generatedId}`;
	const errorId = error ? `${selectId}-error` : undefined;
	const nativeProps = props as Omit<
		ComponentPropsWithoutRef<"select">,
		"children" | "disabled" | "onChange" | "value"
	>;

	return (
		<label
			className={cx("grid gap-1.5 text-sm text-[var(--color-text)]", className)}
		>
			{label && <span className="font-medium">{label}</span>}
			<select
				{...nativeProps}
				aria-describedby={
					cx(nativeProps["aria-describedby"], errorId) || undefined
				}
				aria-invalid={error ? true : nativeProps["aria-invalid"]}
				className={cx(fieldClassName, nativeProps.className)}
				disabled={disabled}
				id={selectId}
				onChange={(event) => onChange?.(event.currentTarget.value)}
				value={value}
			>
				{placeholder && (
					<option disabled value="">
						{placeholder}
					</option>
				)}
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
			{error && (
				<span className="text-xs text-[var(--color-muted)]" id={errorId}>
					{error}
				</span>
			)}
		</label>
	);
}

export default Select;

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
