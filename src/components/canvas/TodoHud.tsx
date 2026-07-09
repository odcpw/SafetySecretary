"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type CanvasTodoEditablePerson = {
	readonly ariaLabel: string;
	readonly onSave: (value: string | null) => Promise<void>;
	readonly value: string | null;
};

export type CanvasTodoItem = {
	readonly editablePerson?: CanvasTodoEditablePerson;
	readonly key: string;
	readonly nodeId: string;
	readonly personLabel?: string | null;
	readonly text: string;
};

export default function TodoHud({
	items,
	onSelect,
	storageScope,
}: {
	readonly items: readonly CanvasTodoItem[];
	readonly onSelect: (nodeId: string) => void;
	readonly storageScope: string;
}) {
	const [open, setOpen] = useState(true);
	const [doneKeys, setDoneKeys] = useState<ReadonlySet<string>>(
		() => new Set(),
	);

	useEffect(() => {
		if (window.innerWidth < 480) {
			setOpen(false);
		}
	}, []);

	useEffect(() => {
		const nextDone = new Set<string>();
		for (const item of items) {
			if (localStorage.getItem(storageKey(storageScope, item.key)) === "done") {
				nextDone.add(item.key);
			}
		}
		setDoneKeys(nextDone);
	}, [items, storageScope]);

	const openItems = useMemo(
		() => items.filter((item) => !doneKeys.has(item.key)),
		[doneKeys, items],
	);
	const doneItems = useMemo(
		() => items.filter((item) => doneKeys.has(item.key)),
		[doneKeys, items],
	);

	const setDone = (item: CanvasTodoItem, checked: boolean) => {
		const key = storageKey(storageScope, item.key);
		if (checked) {
			localStorage.setItem(key, "done");
		} else {
			localStorage.removeItem(key);
		}
		setDoneKeys((current) => {
			const next = new Set(current);
			if (checked) {
				next.add(item.key);
			} else {
				next.delete(item.key);
			}
			return next;
		});
	};

	if (!open) {
		return (
			<button
				aria-label={`Open to-do panel, ${openItems.length} open`}
				className="pointer-events-auto fixed bottom-3 right-3 z-30 inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[rgba(22,22,26,0.96)] px-3 text-sm font-medium text-[var(--color-text)] shadow-lg backdrop-blur sm:bottom-auto sm:top-24"
				data-canvas-todo-badge=""
				onClick={() => setOpen(true)}
				type="button"
			>
				<span>To do</span>
				<span className="rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-xs text-[var(--color-bg)]">
					{openItems.length}
				</span>
			</button>
		);
	}

	return (
		<aside
			className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-auto rounded-t-md border border-[var(--color-border)] bg-[rgba(22,22,26,0.97)] p-3 shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-24 sm:w-[360px] sm:rounded-md"
			data-canvas-todo-panel=""
		>
			<header className="mb-2 flex items-center justify-between gap-3">
				<div>
					<h2 className="m-0 text-sm font-semibold">To do</h2>
					<p className="m-0 text-xs text-[var(--color-muted)]">
						{openItems.length} open
					</p>
				</div>
				<button
					aria-label="Collapse to-do panel"
					className="grid size-8 place-items-center rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
					onClick={() => setOpen(false)}
					type="button"
				>
					<CollapseIcon />
				</button>
			</header>
			<TodoList
				doneKeys={doneKeys}
				emptyText="Nothing open."
				items={openItems}
				onSelect={onSelect}
				onSetDone={setDone}
			/>
			{doneItems.length > 0 ? (
				<details className="mt-3 border-t border-[var(--color-border)] pt-2">
					<summary className="cursor-pointer text-xs font-medium text-[var(--color-muted)]">
						Done ({doneItems.length})
					</summary>
					<div className="mt-2">
						<TodoList
							doneKeys={doneKeys}
							emptyText=""
							items={doneItems}
							onSelect={onSelect}
							onSetDone={setDone}
						/>
					</div>
				</details>
			) : null}
		</aside>
	);
}

function TodoList({
	doneKeys,
	emptyText,
	items,
	onSelect,
	onSetDone,
}: {
	readonly doneKeys: ReadonlySet<string>;
	readonly emptyText: string;
	readonly items: readonly CanvasTodoItem[];
	readonly onSelect: (nodeId: string) => void;
	readonly onSetDone: (item: CanvasTodoItem, checked: boolean) => void;
}) {
	if (items.length === 0) {
		return emptyText ? (
			<p className="m-0 rounded border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-[var(--color-muted)]">
				{emptyText}
			</p>
		) : null;
	}

	return (
		<ul className="m-0 grid list-none gap-1 p-0">
			{items.map((item) => (
				<li
					className="grid grid-cols-[auto_1fr] gap-2 rounded px-2 py-2 hover:bg-[var(--color-surface-elev)]"
					data-canvas-todo-item={item.key}
					data-node-id={item.nodeId}
					key={item.key}
				>
					<input
						aria-label={`Mark handled: ${item.text}`}
						className="mt-1 size-4 accent-[var(--color-accent)]"
						checked={doneKeys.has(item.key)}
						onChange={(event) => onSetDone(item, event.currentTarget.checked)}
						type="checkbox"
					/>
					<TodoItemText item={item} onSelect={onSelect} />
				</li>
			))}
		</ul>
	);
}

function TodoItemText({
	item,
	onSelect,
}: {
	readonly item: CanvasTodoItem;
	readonly onSelect: (nodeId: string) => void;
}) {
	if (!item.editablePerson) {
		return (
			<button
				className="min-w-0 text-left text-sm leading-snug text-[var(--color-text)] hover:text-white"
				onClick={() => onSelect(item.nodeId)}
				type="button"
			>
				{item.text}
			</button>
		);
	}

	return (
		<span className="min-w-0 text-sm leading-snug text-[var(--color-text)]">
			<button
				className="text-left hover:text-white"
				onClick={() => onSelect(item.nodeId)}
				type="button"
			>
				{item.text}
			</button>{" "}
			<EditablePerson editable={item.editablePerson} />
		</span>
	);
}

function EditablePerson({
	editable,
}: {
	readonly editable: CanvasTodoEditablePerson;
}) {
	const [editing, setEditing] = useState(false);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [value, setValue] = useState(editable.value ?? "");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!editing) {
			setValue(editable.value ?? "");
		}
	}, [editable.value, editing]);

	useEffect(() => {
		if (editing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [editing]);

	if (editing) {
		return (
			<input
				aria-label={editable.ariaLabel}
				className="inline-block w-40 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] disabled:opacity-60"
				disabled={saving}
				onBlur={() => void save()}
				onChange={(event) => setValue(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.currentTarget.blur();
					}
					if (event.key === "Escape") {
						setValue(editable.value ?? "");
						setEditing(false);
					}
				}}
				ref={inputRef}
				value={value}
			/>
		);
	}

	return (
		<button
			className="rounded px-1 text-amber-200 underline decoration-amber-200/40 underline-offset-2 hover:bg-amber-200/10 hover:text-amber-100"
			data-canvas-todo-person=""
			onClick={() => setEditing(true)}
			type="button"
		>
			{editable.value?.trim() || "who would know"}
		</button>
	);

	async function save() {
		if (saving) {
			return;
		}
		const nextValue = value.trim() || null;
		if (nextValue === (editable.value?.trim() || null)) {
			setEditing(false);
			return;
		}
		setSaving(true);
		try {
			await editable.onSave(nextValue);
			setEditing(false);
		} finally {
			setSaving(false);
		}
	}
}

function CollapseIcon() {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="16"
			viewBox="0 0 16 16"
			width="16"
		>
			<path
				d="M4 6.5 8 10l4-3.5"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.7"
			/>
		</svg>
	);
}

function storageKey(scope: string, itemKey: string): string {
	return `ssfw:canvas-todo:v1:${scope}:${itemKey}`;
}
