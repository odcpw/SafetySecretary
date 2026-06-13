"use client";

import {
	type ComponentPropsWithoutRef,
	type CSSProperties,
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	useId,
	useRef,
	useState,
} from "react";

export type TableChatLayoutProps = Omit<
	ComponentPropsWithoutRef<"section">,
	"children"
> & {
	"aria-label": string;
	main: ReactNode;
	chat: ReactNode;
	mainLabel: ReactNode;
	chatLabel: ReactNode;
	splitterLabel: string;
	chatControls?: ReactNode;
	chatHidden?: boolean;
	initialChatWidth?: number;
	minMainWidth?: number;
	minChatWidth?: number;
	collapseBreakpoint?: number;
};

const DEFAULT_MIN_MAIN_WIDTH = 480;
const DEFAULT_MIN_CHAT_WIDTH = 320;
const DEFAULT_CHAT_WIDTH = 384;
const DEFAULT_COLLAPSE_BREAKPOINT = 1024;
const RESIZE_STEP = 24;

const rootClassName =
	"grid min-h-0 w-full gap-4 bg-[var(--color-bg)] text-[var(--color-text)] lg:items-stretch";
const splitClassName =
	"lg:grid-cols-[minmax(var(--ssfw-table-chat-main-min),1fr)_0.75rem_minmax(var(--ssfw-table-chat-chat-min),var(--ssfw-table-chat-chat-width))]";
const singleClassName = "lg:grid-cols-[minmax(0,1fr)]";
const paneClassName =
	"min-h-0 min-w-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]";
const paneHeaderClassName =
	"flex min-h-12 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 text-sm font-medium";
const paneBodyClassName = "min-h-0 overflow-auto p-4";
const splitterClassName =
	"hidden min-h-0 w-3 cursor-col-resize touch-none rounded-md border-0 bg-[var(--color-border)] outline-none transition-colors hover:bg-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] lg:block";

export function TableChatLayout({
	"aria-label": ariaLabel,
	main,
	chat,
	mainLabel,
	chatLabel,
	splitterLabel,
	chatControls,
	chatHidden = false,
	initialChatWidth = DEFAULT_CHAT_WIDTH,
	minMainWidth = DEFAULT_MIN_MAIN_WIDTH,
	minChatWidth = DEFAULT_MIN_CHAT_WIDTH,
	collapseBreakpoint = DEFAULT_COLLAPSE_BREAKPOINT,
	className,
	style,
	...layoutProps
}: TableChatLayoutProps) {
	const generatedId = useId();
	const mainId = `${generatedId}-main`;
	const chatId = `${generatedId}-chat`;
	const containerRef = useRef<HTMLElement | null>(null);
	const [chatWidth, setChatWidth] = useState(() =>
		clamp(initialChatWidth, minChatWidth, Math.max(initialChatWidth, minChatWidth)),
	);
	const [maxChatWidth, setMaxChatWidth] = useState(() =>
		Math.max(initialChatWidth, minChatWidth),
	);
	const cssVars = {
		"--ssfw-table-chat-main-min": `${minMainWidth}px`,
		"--ssfw-table-chat-chat-min": `${minChatWidth}px`,
		"--ssfw-table-chat-chat-width": `${chatWidth}px`,
		"--ssfw-table-chat-collapse": `${collapseBreakpoint}px`,
		...style,
	} as CSSProperties;

	function resizeFromClientX(clientX: number) {
		const bounds = containerRef.current?.getBoundingClientRect();
		if (!bounds) {
			return;
		}

		const maxWidth = maxChatWidthForLayout(chatWidth);
		const nextWidth = bounds.right - clientX;
		setMaxChatWidth(maxWidth);
		setChatWidth(clamp(nextWidth, minChatWidth, maxWidth));
	}

	function maxChatWidthForLayout(fallbackMax: number) {
		const bounds = containerRef.current?.getBoundingClientRect();
		if (!bounds || bounds.width <= 0) {
			return Math.max(minChatWidth, fallbackMax);
		}

		return Math.max(minChatWidth, bounds.width - minMainWidth);
	}

	function handlePointerDown(event: PointerEvent<HTMLElement>) {
		if (chatHidden) {
			return;
		}

		event.preventDefault();
		event.currentTarget.setPointerCapture?.(event.pointerId);
		resizeFromClientX(event.clientX);

		const ownerWindow = event.currentTarget.ownerDocument.defaultView;
		if (!ownerWindow) {
			return;
		}

		const handleMove = (moveEvent: globalThis.PointerEvent) => {
			resizeFromClientX(moveEvent.clientX);
		};
		const handleUp = () => {
			ownerWindow.removeEventListener("pointermove", handleMove);
		};

		ownerWindow.addEventListener("pointermove", handleMove);
		ownerWindow.addEventListener("pointerup", handleUp, { once: true });
	}

	function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
		if (chatHidden) {
			return;
		}

		if (event.key === "ArrowLeft") {
			event.preventDefault();
			const maxWidth = maxChatWidthForLayout(chatWidth + RESIZE_STEP);
			setMaxChatWidth(maxWidth);
			setChatWidth((width) =>
				clamp(width + RESIZE_STEP, minChatWidth, maxWidth),
			);
		}

		if (event.key === "ArrowRight") {
			event.preventDefault();
			const maxWidth = maxChatWidthForLayout(chatWidth);
			setMaxChatWidth(maxWidth);
			setChatWidth((width) =>
				clamp(width - RESIZE_STEP, minChatWidth, maxWidth),
			);
		}
	}

	return (
		<section
			{...layoutProps}
			aria-label={ariaLabel}
			className={cx(
				rootClassName,
				chatHidden ? singleClassName : splitClassName,
				className,
			)}
			data-chat-hidden={chatHidden ? "true" : "false"}
			data-collapse-breakpoint={collapseBreakpoint}
			ref={containerRef}
			style={cssVars}
		>
			<section
				aria-labelledby={mainId}
				className={paneClassName}
				data-pane="main"
			>
				<div className={paneHeaderClassName}>
					<h2 className="truncate text-sm font-medium" id={mainId}>
						{mainLabel}
					</h2>
				</div>
				<div className={paneBodyClassName}>{main}</div>
			</section>

			{!chatHidden && (
				<hr
					aria-label={splitterLabel}
					aria-orientation="vertical"
					aria-valuemax={maxChatWidth}
					aria-valuemin={minChatWidth}
					aria-valuenow={chatWidth}
					className={splitterClassName}
					data-splitter="table-chat"
					onKeyDown={handleKeyDown}
					onPointerDown={handlePointerDown}
					tabIndex={0}
				/>
			)}

			{!chatHidden && (
				<aside
					aria-labelledby={chatId}
					className={cx(paneClassName, "max-lg:order-last")}
					data-pane="chat"
					data-secondary-surface="true"
				>
					<div className={paneHeaderClassName}>
						<h2 className="truncate text-sm font-medium" id={chatId}>
							{chatLabel}
						</h2>
						{chatControls && (
							<div className="flex min-w-0 items-center gap-2">
								{chatControls}
							</div>
						)}
					</div>
					<div className={paneBodyClassName}>{chat}</div>
				</aside>
			)}
		</section>
	);
}

export default TableChatLayout;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
