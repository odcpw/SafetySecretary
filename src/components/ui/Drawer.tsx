"use client";

import { type KeyboardEvent, useId, useRef } from "react";
import {
	handleOverlayKeyDown,
	useOverlayFocusTrap,
} from "./Modal";
import type { DrawerProps } from "./types";

const shellClassName =
	"fixed inset-0 z-50 flex justify-end text-[var(--color-text)]";
const backdropClassName =
	"fixed inset-0 bg-[var(--color-bg)] opacity-80";
const drawerClassName =
	"relative z-10 grid h-full max-h-screen w-full gap-4 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-surface-elev)] p-5 shadow-xl outline-none";
const titleClassName = "text-lg font-semibold text-[var(--color-text)]";

const sizeClassNames: Record<NonNullable<DrawerProps["size"]>, string> = {
	sm: "max-w-sm",
	md: "max-w-md",
	lg: "max-w-xl",
};

export function Drawer({
	title,
	isOpen,
	onClose,
	children,
	size = "md",
	closeOnBackdrop = true,
	className,
	id,
	onKeyDown,
	...drawerProps
}: DrawerProps) {
	const generatedId = useId();
	const titleId = id ? `${id}-title` : `drawer-${generatedId}-title`;
	const drawerRef = useRef<HTMLElement | null>(null);

	useOverlayFocusTrap(isOpen, onClose, drawerRef);

	if (!isOpen) {
		return null;
	}

	return (
		<div className={shellClassName}>
			<button
				aria-label="Close drawer"
				className={backdropClassName}
				onClick={() => {
					if (closeOnBackdrop) {
						onClose();
					}
				}}
				tabIndex={-1}
				type="button"
			/>
			<aside
				{...drawerProps}
				aria-labelledby={titleId}
				aria-modal="true"
				className={cx(drawerClassName, sizeClassNames[size], className)}
				id={id}
				onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
					onKeyDown?.(event);
					if (!event.defaultPrevented) {
						handleOverlayKeyDown(event, drawerRef, onClose);
					}
				}}
				ref={drawerRef}
				role="dialog"
			>
				<h2 className={titleClassName} id={titleId}>
					{title}
				</h2>
				{children}
			</aside>
		</div>
	);
}

export default Drawer;

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
