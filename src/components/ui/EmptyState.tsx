"use client";

import type { EmptyStateProps } from "./types";

export default function EmptyState({
	icon,
	title,
	description,
	actionLabel,
	onAction,
	size = "md",
	className = "",
}: EmptyStateProps) {
	const heading = size === "lg" ? "h2" : "h3";
	const Heading = heading;

	return (
		<section
			aria-label={typeof title === "string" ? title : undefined}
			className={[
				"flex flex-col items-center justify-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center",
				size === "lg" && "py-20",
				size === "sm" && "py-6",
				className,
			]
				.filter(Boolean)
				.join(" ")}
		>
			{icon && (
				<span className="mb-1 text-[var(--color-muted)]" aria-hidden="true">
					{icon}
				</span>
			)}
			<Heading className="m-0 text-[var(--text-lg)] font-medium text-[var(--color-text)]">
				{title}
			</Heading>
			<p className="m-0 max-w-sm text-[var(--text-sm)] text-[var(--color-muted)]">
				{description}
			</p>
			{actionLabel && onAction && (
				<button
					type="button"
					onClick={onAction}
					className="mt-2 rounded-md border border-[var(--color-accent)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--color-accent)] shadow-sm outline-none transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
				>
					{actionLabel}
				</button>
			)}
		</section>
	);
}
