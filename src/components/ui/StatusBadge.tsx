"use client";

import Badge from "./Badge";
import type { BadgeProps, StatusBadgeProps } from "./types";

const STATUS_VARIANT: Record<
	StatusBadgeProps["status"],
	NonNullable<BadgeProps["variant"]>
> = {
	open: "info",
	"in-progress": "warning",
	completed: "success",
	blocked: "error",
};

export default function StatusBadge({
	status,
	label,
	size = "md",
	className = "",
	...rest
}: StatusBadgeProps) {
	const dotColor =
		status === "open"
			? "bg-[var(--color-accent)]"
			: status === "in-progress"
				? "bg-[var(--color-muted)]"
				: status === "completed"
					? "bg-[var(--color-accent)]"
					: "bg-[var(--color-accent)]";

	const sizeClass = size === "sm" ? "gap-1 text-xs" : "gap-1.5 text-sm";

	return (
		<Badge
			{...rest}
			variant={STATUS_VARIANT[status]}
			className={[sizeClass, "text-[var(--color-text)]", className].join(" ")}
			role="status"
			aria-live="polite"
		>
			<span
				className={`inline-block h-2 w-2 shrink-0 rounded-full ${dotColor}`}
				aria-hidden="true"
			/>
			<span>{label}</span>
		</Badge>
	);
}
