"use client";

import type { LoadingStateProps } from "./types";

const SKELETON_ROW_KEYS = Array.from(
	{ length: 12 },
	(_, i) => `skeleton-row-${i}`,
);

export default function LoadingState({
	variant = "spinner",
	rows = 3,
	children,
	fullscreen,
	className = "",
}: LoadingStateProps) {
	if (variant === "skeleton") {
		return (
			<div
				role="status"
				aria-live="polite"
				aria-busy="true"
				className={[
					"flex flex-col gap-3",
					fullscreen && "flex items-center justify-center min-h-[20rem]",
					className,
				]
					.filter(Boolean)
					.join(" ")}
			>
				{SKELETON_ROW_KEYS.slice(0, rows).map((key, idx) => (
					<div
						key={key}
						className={[
							"h-4 rounded bg-[var(--color-surface-elev)] animate-pulse",
							idx === rows - 1 ? "w-2/3" : "w-full",
						].join(" ")}
						aria-hidden="true"
					/>
				))}
				{children}
			</div>
		);
	}

	return (
		<div
			role="status"
			aria-live="polite"
			aria-busy="true"
			className={[
				"flex flex-col items-center justify-center gap-3",
				fullscreen && "min-h-[20rem]",
				className,
			]
				.filter(Boolean)
				.join(" ")}
		>
			<svg
				className="h-8 w-8 animate-spin text-[var(--color-muted)]"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<circle
					className="opacity-25"
					cx="12"
					cy="12"
					r="10"
					stroke="currentColor"
					strokeWidth="4"
				/>
				<path
					className="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
				/>
			</svg>
			{children}
		</div>
	);
}
