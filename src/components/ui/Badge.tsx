"use client";

import type { BadgeProps } from "./types";

const TONE_MARKER: Record<NonNullable<BadgeProps["variant"]>, string> = {
	neutral: "·",
	info: "ℹ",
	success: "✓",
	warning: "⚠",
	error: "✕",
};

const TONE_CLASS: Record<NonNullable<BadgeProps["variant"]>, string> = {
	neutral:
		"bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border)]",
	info: "bg-[var(--color-surface)] text-[var(--color-accent)] border-[var(--color-accent)]",
	success:
		"bg-[var(--color-surface)] text-[var(--color-accent)] border-[var(--color-accent)]",
	warning:
		"bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-muted)]",
	error:
		"bg-[var(--color-surface)] text-[var(--color-accent)] border-[var(--color-accent)]",
};

export default function Badge({
	variant = "neutral",
	children,
	className = "",
	...rest
}: BadgeProps) {
	const toneClass = TONE_CLASS[variant];
	const marker = TONE_MARKER[variant];

	return (
		<span
			className={[
				"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
				toneClass,
				className,
			].join(" ")}
			{...rest}
		>
			<span aria-hidden="true" className="leading-none">
				{marker}
			</span>
			{children}
		</span>
	);
}
