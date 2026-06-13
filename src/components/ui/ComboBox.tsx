"use client";

import {
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useId,
	useMemo,
	useState,
} from "react";
import type { ComboBoxProps } from "./types";

type PickerOption = ComboBoxProps["options"][number];

const inputClassName =
	"min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] shadow-sm outline-none transition-colors placeholder:text-[var(--color-muted)] hover:border-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-60";
const listClassName =
	"absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] py-1 shadow-lg";
const optionClassName =
	"cursor-pointer px-3 py-2 text-sm text-[var(--color-text)] outline-none";
const activeOptionClassName = "bg-[var(--color-surface)]";

export function ComboBox({
	label,
	options,
	value,
	defaultValue,
	onChange,
	disabled,
	error,
	placeholder,
	allowFreeText = false,
	filterKey = "label",
	className,
	id,
	onBlur,
	onFocus,
	onKeyDown,
	...inputProps
}: ComboBoxProps) {
	const generatedId = useId();
	const inputId = id ?? `combobox-${generatedId}`;
	const listboxId = `${inputId}-listbox`;
	const errorId = error ? `${inputId}-error` : undefined;
	const isControlled = value !== undefined;
	const [internalValue, setInternalValue] = useState(() =>
		stringDefaultValue(defaultValue),
	);
	const selectedValue = isControlled ? (value ?? "") : internalValue;
	const [inputValue, setInputValue] = useState(() =>
		displayValue(options, selectedValue, allowFreeText),
	);
	const [isOpen, setIsOpen] = useState(false);
	const [highlightedIndex, setHighlightedIndex] = useState(0);

	useEffect(() => {
		setInputValue(displayValue(options, selectedValue, allowFreeText));
	}, [allowFreeText, options, selectedValue]);

	const filteredOptions = useMemo(() => {
		const query = inputValue.trim().toLowerCase();

		if (!query) {
			return options;
		}

		return options.filter((option) =>
			optionSearchText(option, filterKey).toLowerCase().includes(query),
		);
	}, [filterKey, inputValue, options]);

	const activeOption = filteredOptions[highlightedIndex];
	const activeOptionId =
		isOpen && activeOption ? optionId(inputId, highlightedIndex) : undefined;

	function openWithIndex(index: number) {
		if (disabled || filteredOptions.length === 0) {
			return;
		}

		setHighlightedIndex(clampIndex(index, filteredOptions.length));
		setIsOpen(true);
	}

	function commitValue(nextValue: string, nextInputValue: string) {
		if (!isControlled) {
			setInternalValue(nextValue);
		}
		setInputValue(nextInputValue);
		onChange?.(nextValue);
	}

	function selectOption(option: PickerOption) {
		commitValue(option.value, optionLabelText(option));
		setIsOpen(false);
	}

	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		onKeyDown?.(event);

		if (event.defaultPrevented || disabled) {
			return;
		}

		if (event.key === "ArrowDown") {
			event.preventDefault();
			openWithIndex(isOpen ? highlightedIndex + 1 : 0);
			return;
		}

		if (event.key === "ArrowUp") {
			event.preventDefault();
			openWithIndex(isOpen ? highlightedIndex - 1 : filteredOptions.length - 1);
			return;
		}

		if (event.key === "Home" && isOpen) {
			event.preventDefault();
			openWithIndex(0);
			return;
		}

		if (event.key === "End" && isOpen) {
			event.preventDefault();
			openWithIndex(filteredOptions.length - 1);
			return;
		}

		if (event.key === "Enter" && isOpen) {
			event.preventDefault();
			if (activeOption) {
				selectOption(activeOption);
			} else if (allowFreeText) {
				commitValue(inputValue, inputValue);
				setIsOpen(false);
			}
			return;
		}

		if (event.key === "Escape" && isOpen) {
			event.preventDefault();
			setIsOpen(false);
		}
	}

	return (
		<label
			className={cx("grid gap-1.5 text-sm text-[var(--color-text)]", className)}
		>
			{label && <span className="font-medium">{label}</span>}
			<span className="relative">
				<input
					{...inputProps}
					aria-activedescendant={activeOptionId}
					aria-autocomplete="list"
					aria-controls={listboxId}
					aria-describedby={
						cx(inputProps["aria-describedby"], errorId) || undefined
					}
					aria-expanded={isOpen}
					aria-invalid={error ? true : inputProps["aria-invalid"]}
					className={inputClassName}
					disabled={disabled}
					id={inputId}
					onBlur={(event) => {
						setIsOpen(false);
						onBlur?.(event);
					}}
					onChange={(event) => {
						const nextInputValue = event.currentTarget.value;
						setInputValue(nextInputValue);
						setHighlightedIndex(0);
						setIsOpen(true);

						if (allowFreeText) {
							commitValue(nextInputValue, nextInputValue);
						}
					}}
					onFocus={(event) => {
						if (filteredOptions.length > 0) {
							setIsOpen(true);
						}
						onFocus?.(event);
					}}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					role="combobox"
					type="text"
					value={inputValue}
				/>
				<div
					className={listClassName}
					hidden={!isOpen || filteredOptions.length === 0}
					id={listboxId}
					role="listbox"
				>
					{filteredOptions.map((option, index) => (
						<div
							aria-selected={option.value === selectedValue}
							className={cx(
								optionClassName,
								index === highlightedIndex && activeOptionClassName,
							)}
							id={optionId(inputId, index)}
							key={option.value}
							onMouseDown={(event) => event.preventDefault()}
							onPointerEnter={() => setHighlightedIndex(index)}
							onClick={() => selectOption(option)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									selectOption(option);
								}
							}}
							role="option"
							tabIndex={-1}
						>
							{option.label}
						</div>
					))}
				</div>
			</span>
			{error && (
				<span className="text-xs text-[var(--color-muted)]" id={errorId}>
					{error}
				</span>
			)}
		</label>
	);
}

export default ComboBox;

function optionId(inputId: string, index: number): string {
	return `${inputId}-option-${index}`;
}

function stringDefaultValue(value: unknown): string {
	if (typeof value === "string" || typeof value === "number") {
		return String(value);
	}

	return "";
}

function displayValue(
	options: readonly PickerOption[],
	selectedValue: string,
	allowFreeText: boolean,
): string {
	const selectedOption = options.find(
		(option) => option.value === selectedValue,
	);
	if (selectedOption) {
		return optionLabelText(selectedOption);
	}

	return allowFreeText ? selectedValue : "";
}

function optionSearchText(option: PickerOption, filterKey: string): string {
	const candidate =
		filterKey === "label"
			? option.label
			: (option as Record<string, unknown>)[filterKey];

	if (typeof candidate === "string" || typeof candidate === "number") {
		return String(candidate);
	}

	return optionLabelText(option);
}

function optionLabelText(option: PickerOption): string {
	return nodeText(option.label) || option.value;
}

function nodeText(node: ReactNode): string {
	if (typeof node === "string" || typeof node === "number") {
		return String(node);
	}

	if (Array.isArray(node)) {
		return node.map(nodeText).join("");
	}

	return "";
}

function clampIndex(index: number, length: number): number {
	if (length === 0) {
		return 0;
	}

	return Math.max(0, Math.min(index, length - 1));
}

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
