"use client";

import {
	cloneElement,
	type FocusEvent,
	isValidElement,
	type MouseEvent,
	type ReactElement,
	useId,
	useRef,
	useState,
} from "react";
import type { TooltipProps } from "./types";

type TriggerProps = {
	"aria-describedby"?: string;
	onBlur?: (event: FocusEvent<HTMLElement>) => void;
	onFocus?: (event: FocusEvent<HTMLElement>) => void;
	onMouseEnter?: (event: MouseEvent<HTMLElement>) => void;
	onMouseLeave?: (event: MouseEvent<HTMLElement>) => void;
};

const wrapperClassName = "relative inline-flex";
const tooltipClassName =
	"pointer-events-none absolute z-20 max-w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-2 py-1 text-xs text-[var(--color-text)] shadow-lg";

const placementClassNames: Record<NonNullable<TooltipProps["placement"]>, string> =
	{
		top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
		bottom: "left-1/2 top-full mt-2 -translate-x-1/2",
		left: "right-full top-1/2 mr-2 -translate-y-1/2",
		right: "left-full top-1/2 ml-2 -translate-y-1/2",
	};

export function Tooltip({
	content,
	children,
	placement = "top",
	delay = 250,
	className,
	id,
	onMouseEnter,
	onMouseLeave,
	onFocus,
	onBlur,
	...wrapperProps
}: TooltipProps) {
	const generatedId = useId();
	const tooltipId = id ?? `tooltip-${generatedId}`;
	const [isVisible, setIsVisible] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	function clearDelay() {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
	}

	function show() {
		clearDelay();
		timeoutRef.current = setTimeout(() => {
			setIsVisible(true);
		}, delay);
	}

	function hide() {
		clearDelay();
		setIsVisible(false);
	}

	const trigger = triggerElement(children, {
		"aria-describedby": tooltipId,
		onBlur: (event) => {
			hide();
			onBlur?.(event);
		},
		onFocus: (event) => {
			show();
			onFocus?.(event);
		},
		onMouseEnter: (event) => {
			show();
			onMouseEnter?.(event);
		},
		onMouseLeave: (event) => {
			hide();
			onMouseLeave?.(event);
		},
	});

	return (
		<span {...wrapperProps} className={cx(wrapperClassName, className)}>
			{trigger}
			<span
				className={cx(
					tooltipClassName,
					placementClassNames[placement],
				)}
				hidden={!isVisible}
				id={tooltipId}
				role="tooltip"
			>
				{content}
			</span>
		</span>
	);
}

export default Tooltip;

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}

function triggerElement(
	children: TooltipProps["children"],
	handlers: TriggerProps,
): ReactElement | TooltipProps["children"] {
	if (!isValidElement<TriggerProps>(children)) {
		return children;
	}

	return cloneElement(children, {
		"aria-describedby": cx(
			children.props["aria-describedby"],
			handlers["aria-describedby"],
		),
		onBlur: (event) => {
			children.props.onBlur?.(event);
			handlers.onBlur?.(event);
		},
		onFocus: (event) => {
			children.props.onFocus?.(event);
			handlers.onFocus?.(event);
		},
		onMouseEnter: (event) => {
			children.props.onMouseEnter?.(event);
			handlers.onMouseEnter?.(event);
		},
		onMouseLeave: (event) => {
			children.props.onMouseLeave?.(event);
			handlers.onMouseLeave?.(event);
		},
	});
}
