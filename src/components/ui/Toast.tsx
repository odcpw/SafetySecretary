import type { ToastProps } from "./types";

const toastClassName =
	"grid gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] p-3 text-sm text-[var(--color-text)] shadow-lg";
const messageClassName = "text-[var(--color-text)]";
const actionClassName =
	"justify-self-start rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)] outline-none transition-colors hover:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]";

export function Toast({
	message,
	variant = "info",
	duration,
	actionLabel,
	onAction,
	className,
	id,
	...toastProps
}: ToastProps) {
	const isError = variant === "error";

	return (
		<div
			{...toastProps}
			aria-live={isError ? "assertive" : "polite"}
			className={cx(toastClassName, className)}
			data-duration={duration}
			data-variant={variant}
			id={id}
			role={isError ? "alert" : "status"}
		>
			<div className={messageClassName}>{message}</div>
			{actionLabel && (
				<button className={actionClassName} onClick={onAction} type="button">
					{actionLabel}
				</button>
			)}
		</div>
	);
}

export default Toast;

function cx(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
