import {
	LLM_LOGGING_ADMIN_COPY,
	isLLMDebugLoggingEnabled,
	llmDebugLoggingStatusText,
} from "../../../../lib/llm/logging";

export default function DebugLogSettingsPage() {
	const debugEnabled = isLLMDebugLoggingEnabled();
	const statusText = llmDebugLoggingStatusText();

	return (
		<article
			className="grid gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
			data-debug-llm-logging={debugEnabled ? "on" : "off"}
			data-owning-bead="ssfw-q4p"
		>
			<header className="grid gap-2">
				<p className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
					{LLM_LOGGING_ADMIN_COPY.eyebrow}
				</p>
				<div className="flex flex-wrap items-center gap-3">
					<h2 className="m-0 text-lg font-semibold">
						{LLM_LOGGING_ADMIN_COPY.title}
					</h2>
					<span
						className={
							debugEnabled
								? "rounded-sm border border-amber-400/60 bg-amber-400/10 px-2 py-1 text-xs font-medium text-amber-200"
								: "rounded-sm border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 text-xs font-medium text-[var(--color-muted)]"
						}
					>
						{statusText}
					</span>
				</div>
			</header>
			<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
				{LLM_LOGGING_ADMIN_COPY.body}
			</p>
			<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
				{LLM_LOGGING_ADMIN_COPY.debugStream}
			</p>
			<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
				{LLM_LOGGING_ADMIN_COPY.metadata}
			</p>
		</article>
	);
}
