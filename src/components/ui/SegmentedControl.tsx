"use client";

import { type KeyboardEvent, useEffect, useRef } from "react";
import type { SegmentedControlProps } from "./types";

type SegmentOption = SegmentedControlProps["options"][number];

const rootClassName =
	"inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-sm text-[var(--color-text)]";
const segmentClassName =
	"min-w-0 rounded-sm border border-transparent font-medium text-[var(--color-muted)] outline-none transition-colors hover:bg-[var(--color-surface-elev)] hover:text-[var(--color-text)] has-disabled:cursor-not-allowed has-disabled:opacity-60 has-focus-visible:ring-2 has-focus-visible:ring-[var(--color-accent)] has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-[var(--color-bg)]";
const selectedSegmentClassName =
	"bg-[var(--color-surface-elev)] text-[var(--color-text)] shadow-sm";

const sizeClassNames: Record<NonNullable<SegmentedControlProps["size"]>, string> =
	{
		sm: "min-h-7 px-2 py-1 text-xs",
		md: "min-h-9 px-3 py-1.5 text-sm",
	};

export function SegmentedControl({
	options,
	value,
	onChange,
	disabled = false,
	size = "md",
	className,
	...rootProps
}: SegmentedControlProps) {
	const refs = useRef<Array<HTMLInputElement | null>>([]);
	const selectedIndex = options.findIndex((option) => option.value === value);
	const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;

	useEffect(() => {
		refs.current = refs.current.slice(0, options.length);
	}, [options.length]);

	function selectOption(option: SegmentOption, index: number) {
		if (disabled || option.value === value) {
			return;
		}

		onChange?.(option.value);
		queueMicrotask(() => refs.current[index]?.focus());
	}

	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
		if (event.defaultPrevented || disabled || options.length === 0) {
			return;
		}

		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			selectOption(options[index], index);
			return;
		}

		const nextIndex = keyTargetIndex(event.key, options.length, index);

		if (nextIndex === index) {
			return;
		}

		event.preventDefault();
		selectOption(options[nextIndex], nextIndex);
	}

	return (
		<div
			{...rootProps}
			aria-disabled={disabled || undefined}
			className={cx(rootClassName, className)}
			role="radiogroup"
		>
			{options.map((option, index) => {
				const selected = option.value === value;

				return (
					<label
						className={cx(
							segmentClassName,
							sizeClassNames[size],
							selected && selectedSegmentClassName,
						)}
						key={option.value}
					>
						<input
							aria-checked={selected}
							checked={selected}
							className="sr-only"
							disabled={disabled}
							onChange={() => selectOption(option, index)}
							onKeyDown={(event) => handleKeyDown(event, index)}
							ref={(node) => {
								refs.current[index] = node;
							}}
							tabIndex={index === focusIndex ? 0 : -1}
							type="radio"
							value={option.value}
						/>
						{option.label}
					</label>
				);
			})}
		</div>
	);
}

export default SegmentedControl;

function keyTargetIndex(
	key: string,
	length: number,
	currentIndex: number,
): number {
	if (key === "Home") {
		return 0;
	}

	if (key === "End") {
		return length - 1;
	}

	if (key === "ArrowRight" || key === "ArrowDown") {
		return (currentIndex + 1) % length;
	}

	if (key === "ArrowLeft" || key === "ArrowUp") {
		return (currentIndex - 1 + length) % length;
	}

	return currentIndex;
}

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
