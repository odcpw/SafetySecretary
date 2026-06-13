import type { ReactNode } from "react";

type WorkbenchTileProps = {
	title: string;
	blurb: string;
	icon: ReactNode;
} & (
	| { href: string; disabled?: false; comingSoonLabel?: never }
	| { href?: never; disabled: true; comingSoonLabel: string }
);

const tileShell =
	"flex flex-col gap-3 rounded-lg border p-5 text-left transition-colors";

const iconShell =
	"flex size-9 items-center justify-center rounded-md border border-[var(--color-border)]";

/**
 * A single workbench entry on the landing page.
 *
 * Active tiles render as a real <a> so they are keyboard-focusable and use the
 * shared focus-visible ring pattern. Disabled tiles render as a non-interactive
 * <div> with muted styling and aria-disabled, so they are announced but not
 * actionable.
 */
export default function WorkbenchTile(props: WorkbenchTileProps) {
	const { title, blurb, icon } = props;

	if (props.disabled) {
		return (
			<div
				aria-disabled="true"
				className={`${tileShell} cursor-not-allowed border-[var(--color-border)] bg-[var(--color-surface)] opacity-60`}
			>
				<div className="flex items-center justify-between gap-3">
					<span
						className={`${iconShell} bg-[var(--color-bg)] text-[var(--color-muted)]`}
					>
						{icon}
					</span>
					<span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-[var(--text-xs)] font-medium text-[var(--color-muted)]">
						{props.comingSoonLabel}
					</span>
				</div>
				<div className="flex flex-col gap-1.5">
					<h2 className="m-0 text-[var(--text-lg)] font-medium text-[var(--color-text)]">
						{title}
					</h2>
					<p className="m-0 text-[var(--text-sm)] leading-relaxed text-[var(--color-muted)]">
						{blurb}
					</p>
				</div>
			</div>
		);
	}

	return (
		<a
			className={`${tileShell} group border-[var(--color-border)] bg-[var(--color-surface)] outline-none hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-elev)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]`}
			href={props.href}
		>
			<div className="flex items-center justify-between gap-3">
				<span
					className={`${iconShell} bg-[var(--color-bg)] text-[var(--color-accent)]`}
				>
					{icon}
				</span>
				<span
					aria-hidden="true"
					className="text-[var(--color-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-text)]"
				>
					{"→"}
				</span>
			</div>
			<div className="flex flex-col gap-1.5">
				<h2 className="m-0 text-[var(--text-lg)] font-medium text-[var(--color-text)]">
					{title}
				</h2>
				<p className="m-0 text-[var(--text-sm)] leading-relaxed text-[var(--color-muted)]">
					{blurb}
				</p>
			</div>
		</a>
	);
}
