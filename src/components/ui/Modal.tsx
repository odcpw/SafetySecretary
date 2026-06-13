"use client";

import {
	type KeyboardEvent,
	type RefObject,
	useEffect,
	useId,
	useRef,
} from "react";
import type { ModalProps } from "./types";

type FocusTrapRef = RefObject<HTMLElement | null>;

const shellClassName =
	"fixed inset-0 z-50 grid place-items-center p-4 text-[var(--color-text)]";
const backdropClassName =
	"fixed inset-0 bg-[var(--color-bg)] opacity-80";
const panelClassName =
	"relative z-10 grid max-h-[calc(100vh-2rem)] w-full gap-4 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] p-5 shadow-xl outline-none";
const titleClassName = "text-lg font-semibold text-[var(--color-text)]";

const sizeClassNames: Record<NonNullable<ModalProps["size"]>, string> = {
	sm: "max-w-sm",
	md: "max-w-lg",
	lg: "max-w-2xl",
	full: "max-w-[calc(100vw-2rem)]",
};

export function Modal({
	title,
	isOpen,
	onClose,
	children,
	size = "md",
	closeOnBackdrop = true,
	className,
	id,
	onKeyDown,
	...dialogProps
}: ModalProps) {
	const generatedId = useId();
	const titleId = id ? `${id}-title` : `modal-${generatedId}-title`;
	const dialogRef = useRef<HTMLDivElement | null>(null);

	useOverlayFocusTrap(isOpen, onClose, dialogRef);

	if (!isOpen) {
		return null;
	}

	return (
		<div className={shellClassName}>
			<button
				aria-label="Close dialog"
				className={backdropClassName}
				onClick={() => {
					if (closeOnBackdrop) {
						onClose();
					}
				}}
				tabIndex={-1}
				type="button"
			/>
			<div
				{...dialogProps}
				aria-labelledby={titleId}
				aria-modal="true"
				className={cx(panelClassName, sizeClassNames[size], className)}
				id={id}
				onKeyDown={(event) => {
					onKeyDown?.(event);
					if (!event.defaultPrevented) {
						handleOverlayKeyDown(event, dialogRef, onClose);
					}
				}}
				ref={dialogRef}
				role="dialog"
			>
				<h2 className={titleClassName} id={titleId}>
					{title}
				</h2>
				{children}
			</div>
		</div>
	);
}

export default Modal;

export function useOverlayFocusTrap(
	isOpen: boolean,
	onClose: () => void,
	containerRef: FocusTrapRef,
) {
	const previousActiveRef = useRef<HTMLElement | null>(null);
	const onCloseRef = useRef(onClose);

	useEffect(() => {
		onCloseRef.current = onClose;
	}, [onClose]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		previousActiveRef.current =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		focusFirstElement(containerRef.current);

		function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
			if (
				event.target instanceof Node &&
				containerRef.current?.contains(event.target)
			) {
				return;
			}

			if (event.key === "Escape") {
				event.preventDefault();
				onCloseRef.current();
			}
		}

		document.addEventListener("keydown", handleDocumentKeyDown);

		return () => {
			document.removeEventListener("keydown", handleDocumentKeyDown);
			previousActiveRef.current?.focus();
		};
	}, [containerRef, isOpen]);
}

export function handleOverlayKeyDown<Element extends HTMLElement>(
	event: KeyboardEvent<Element>,
	containerRef: RefObject<Element | null>,
	onClose: () => void,
) {
	if (event.key === "Escape") {
		event.preventDefault();
		onClose();
		return;
	}

	if (event.key !== "Tab") {
		return;
	}

	const focusable = focusableElements(containerRef.current);
	if (focusable.length === 0) {
		return;
	}

	const first = focusable[0];
	const last = focusable[focusable.length - 1];

	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault();
		last.focus();
		return;
	}

	if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault();
		first.focus();
	}
}

function focusFirstElement(container: HTMLElement | null) {
	const [first] = focusableElements(container);
	first?.focus();
}

function focusableElements(container: HTMLElement | null): HTMLElement[] {
	if (!container) {
		return [];
	}

	return [
		...container.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
		),
	].filter((element) => !element.hasAttribute("hidden"));
}

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
