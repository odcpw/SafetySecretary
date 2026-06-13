"use client";

import type { ErrorStateProps } from "./types";

export default function ErrorState({
	title,
	message,
	onRetry,
	retryLabel = "Retry",
	code,
	details,
	className = "",
}: ErrorStateProps) {
	return (
		<section
			role="alert"
			aria-label={typeof title === "string" ? title : undefined}
			className={[
				"flex flex-col items-center justify-center gap-3 rounded-lg border border-[var(--color-accent)] bg-[var(--color-surface)] px-6 py-12 text-center",
				className,
			].join(" ")}
		>
			<span className="text-[var(--color-accent)]" aria-hidden="true">
				✕
			</span>
			<h2 className="m-0 text-[var(--text-lg)] font-medium text-[var(--color-text)]">
				{title}
			</h2>
			<p className="m-0 max-w-sm text-[var(--text-sm)] text-[var(--color-muted)]">
				{message}
			</p>
			{details && (
				<p className="m-0 max-w-sm text-[var(--text-xs)] text-[var(--color-muted)]">
					{details}
				</p>
			)}
			{code && (
				<code className="rounded bg-[var(--color-bg)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
					{code}
				</code>
			)}
			{onRetry && (
				<button
					type="button"
					onClick={onRetry}
					className="mt-2 rounded-md border border-[var(--color-accent)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--color-accent)] shadow-sm outline-none transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
				>
					{retryLabel}
				</button>
			)}
		</section>
	);
}
