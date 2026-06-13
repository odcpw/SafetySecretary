"use client";

import {
	type KeyboardEvent,
	type RefObject,
	useEffect,
	useId,
	useRef,
} from "react";
import { handleOverlayKeyDown } from "../ui/Modal";

type InspectorPanelSize = "sm" | "md" | "lg";

export interface InspectorPanelProps {
	title: React.ReactNode;
	isOpen: boolean;
	onClose: () => void;
	children: React.ReactNode;
	size?: InspectorPanelSize;
	modal?: boolean;
	dismissOnScrim?: boolean;
	id?: string;
	className?: string;
}

const shellClassName =
	"fixed inset-0 z-50 flex items-end justify-stretch text-[var(--color-text)] lg:items-stretch lg:justify-end";
const scrimClassName =
	"absolute inset-0 bg-[var(--color-bg)] opacity-70";
const panelClassName =
	"relative z-10 grid max-h-[85dvh] w-full gap-4 overflow-auto rounded-t-md border-t border-[var(--color-border)] bg-[var(--color-surface-elev)] p-5 shadow-xl outline-none lg:h-full lg:max-h-dvh lg:rounded-none lg:rounded-l-md lg:border-l lg:border-t-0";
const titleClassName = "text-base font-semibold text-[var(--color-text)]";

const sizeClassNames: Record<InspectorPanelSize, string> = {
	sm: "lg:max-w-sm",
	md: "lg:max-w-md",
	lg: "lg:max-w-xl",
};

export function InspectorPanel({
	title,
	isOpen,
	onClose,
	children,
	size = "md",
	modal = false,
	dismissOnScrim = true,
	id,
	className,
}: InspectorPanelProps) {
	const generatedId = useId();
	const titleId = id ? `${id}-title` : `inspector-${generatedId}-title`;
	const panelRef = useRef<HTMLElement | null>(null);
	const resolvedClassName = cx(panelClassName, sizeClassNames[size], className);
	const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
		if (modal) {
			handleOverlayKeyDown(event, panelRef, onClose);
			return;
		}

		if (event.key === "Escape") {
			event.preventDefault();
			onClose();
		}
	};
	const content = (
		<>
			<h2 className={titleClassName} id={titleId}>
				{title}
			</h2>
			{children}
		</>
	);

	useInspectorFocus(isOpen, panelRef);
	useInspectorGlobalEscape(isOpen, onClose);

	if (!isOpen) {
		return null;
	}

	return (
		<div className={shellClassName}>
			<button
				aria-label="Close inspector"
				className={scrimClassName}
				onClick={() => {
					if (dismissOnScrim) {
						onClose();
					}
				}}
				tabIndex={-1}
				type="button"
			/>
			{modal ? (
				<div
					aria-labelledby={titleId}
					aria-modal="true"
					className={resolvedClassName}
					id={id}
					onKeyDown={handleKeyDown}
					ref={(element) => {
						panelRef.current = element;
					}}
					role="dialog"
				>
					{content}
				</div>
			) : (
				<section
					aria-labelledby={titleId}
					className={resolvedClassName}
					id={id}
					onKeyDown={handleKeyDown}
					ref={(element) => {
						panelRef.current = element;
					}}
				>
					{content}
				</section>
			)}
		</div>
	);
}

export default InspectorPanel;

function useInspectorFocus(
	isOpen: boolean,
	containerRef: RefObject<HTMLElement | null>,
) {
	const previousActiveRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		previousActiveRef.current =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		focusFirstElement(containerRef.current);

		return () => {
			previousActiveRef.current?.focus();
		};
	}, [containerRef, isOpen]);
}

function useInspectorGlobalEscape(isOpen: boolean, onClose: () => void) {
	const onCloseRef = useRef(onClose);

	useEffect(() => {
		onCloseRef.current = onClose;
	}, [onClose]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
			if (event.defaultPrevented || event.key !== "Escape") {
				return;
			}

			event.preventDefault();
			onCloseRef.current();
		}

		document.addEventListener("keydown", handleDocumentKeyDown);

		return () => {
			document.removeEventListener("keydown", handleDocumentKeyDown);
		};
	}, [isOpen]);
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
