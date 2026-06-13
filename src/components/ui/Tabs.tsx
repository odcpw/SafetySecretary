"use client";

import {
	type KeyboardEvent,
	type RefObject,
	useEffect,
	useId,
	useMemo,
	useRef,
} from "react";
import type { TabsProps } from "./types";

type TabItem = TabsProps["tabs"][number];

const rootClassName = "grid gap-3 text-sm text-[var(--color-text)]";
const leftRootClassName = "grid gap-4 md:grid-cols-[12rem_1fr]";
const tabListClassName =
	"flex gap-1 border-b border-[var(--color-border)] text-sm";
const leftTabListClassName =
	"flex flex-col gap-1 border-b-0 border-r border-[var(--color-border)] pr-2";
const tabClassName =
	"min-h-10 rounded-t-md border-b-2 border-transparent px-3 py-2 text-[var(--color-muted)] outline-none transition-colors hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-50";
const activeTabClassName =
	"border-[var(--color-accent)] bg-[var(--color-surface)] font-medium text-[var(--color-text)]";
const leftTabClassName = "rounded-md border-b-0 border-l-2 text-left";
const panelClassName =
	"rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 outline-none";

export function Tabs({
	tabs,
	activeValue,
	onChange,
	placement = "top",
	className,
	...rootProps
}: TabsProps) {
	const generatedId = useId();
	const refs = useRef<Array<HTMLButtonElement | null>>([]);
	const activeIndex = findEnabledIndex(tabs, activeValue);
	const focusedIndex = activeIndex >= 0 ? activeIndex : firstEnabledIndex(tabs);
	const ids = useMemo(
		() => tabs.map((tab) => safeId(generatedId, tab.value)),
		[generatedId, tabs],
	);

	useEffect(() => {
		refs.current = refs.current.slice(0, tabs.length);
	}, [tabs.length]);

	function selectTab(index: number) {
		const tab = tabs[index];
		if (!tab || tab.disabled) {
			return;
		}

		onChange?.(tab.value);
		queueMicrotask(() => refs.current[index]?.focus());
	}

	function handleKeyDown(
		event: KeyboardEvent<HTMLButtonElement>,
		index: number,
	) {
		const nextIndex = keyTargetIndex(event.key, tabs, index);

		if (nextIndex === index) {
			return;
		}

		event.preventDefault();
		selectTab(nextIndex);
	}

	return (
		<div
			{...rootProps}
			className={cx(
				rootClassName,
				placement === "left" && leftRootClassName,
				className,
			)}
		>
			<div
				aria-orientation={placement === "left" ? "vertical" : undefined}
				className={cx(
					tabListClassName,
					placement === "left" && leftTabListClassName,
				)}
				role="tablist"
			>
				{tabs.map((tab, index) => {
					const selected = tab.value === activeValue;
					const baseId = ids[index];

					return (
						<button
							aria-controls={`${baseId}-panel`}
							aria-selected={selected}
							className={cx(
								tabClassName,
								placement === "left" && leftTabClassName,
								selected && activeTabClassName,
							)}
							disabled={tab.disabled}
							id={`${baseId}-tab`}
							key={tab.value}
							onClick={() => selectTab(index)}
							onKeyDown={(event) => handleKeyDown(event, index)}
							ref={setRef(refs, index)}
							role="tab"
							tabIndex={index === focusedIndex ? 0 : -1}
							type="button"
						>
							{tab.label}
						</button>
					);
				})}
			</div>
			{tabs.map((tab, index) => {
				const selected = tab.value === activeValue;
				const baseId = ids[index];

				return (
					<div
						aria-labelledby={`${baseId}-tab`}
						className={panelClassName}
						hidden={!selected}
						id={`${baseId}-panel`}
						key={tab.value}
						role="tabpanel"
					>
						{tab.content}
					</div>
				);
			})}
		</div>
	);
}

export default Tabs;

function keyTargetIndex(
	key: string,
	tabs: readonly TabItem[],
	currentIndex: number,
): number {
	if (key === "Home") {
		return firstEnabledIndex(tabs);
	}

	if (key === "End") {
		return lastEnabledIndex(tabs);
	}

	if (key === "ArrowRight" || key === "ArrowDown") {
		return nextEnabledIndex(tabs, currentIndex, 1);
	}

	if (key === "ArrowLeft" || key === "ArrowUp") {
		return nextEnabledIndex(tabs, currentIndex, -1);
	}

	return currentIndex;
}

function firstEnabledIndex(tabs: readonly TabItem[]): number {
	return tabs.findIndex((tab) => !tab.disabled);
}

function lastEnabledIndex(tabs: readonly TabItem[]): number {
	for (let index = tabs.length - 1; index >= 0; index -= 1) {
		if (!tabs[index]?.disabled) {
			return index;
		}
	}

	return -1;
}

function findEnabledIndex(tabs: readonly TabItem[], value: string): number {
	const index = tabs.findIndex((tab) => tab.value === value && !tab.disabled);
	return index >= 0 ? index : -1;
}

function nextEnabledIndex(
	tabs: readonly TabItem[],
	currentIndex: number,
	direction: 1 | -1,
): number {
	if (tabs.length === 0) {
		return -1;
	}

	let index = currentIndex;
	for (let step = 0; step < tabs.length; step += 1) {
		index = (index + direction + tabs.length) % tabs.length;
		if (!tabs[index]?.disabled) {
			return index;
		}
	}

	return currentIndex;
}

function setRef(
	refs: RefObject<Array<HTMLButtonElement | null>>,
	index: number,
) {
	return (node: HTMLButtonElement | null) => {
		refs.current[index] = node;
	};
}

function safeId(prefix: string, value: string): string {
	return `${prefix}-${value.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
