import { LLM_LOGGING_LEGAL_COPY } from "../../../lib/llm/logging";

export default function LLMLoggingLegalPage() {
	return (
		<main className="mx-auto grid min-h-screen w-full max-w-3xl content-center gap-6 px-4 py-10 text-[var(--color-text)]">
			<section className="grid gap-5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] p-5 shadow-sm">
				<header className="grid gap-2">
					<h1 className="m-0 text-xl font-semibold">
						{LLM_LOGGING_LEGAL_COPY.title}
					</h1>
					<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
						{LLM_LOGGING_LEGAL_COPY.intro}
					</p>
				</header>
				<section className="grid gap-2">
					<h2 className="m-0 text-base font-semibold">
						{LLM_LOGGING_LEGAL_COPY.defaultHeading}
					</h2>
					<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
						{LLM_LOGGING_LEGAL_COPY.defaultBody}
					</p>
				</section>
				<section className="grid gap-2">
					<h2 className="m-0 text-base font-semibold">
						{LLM_LOGGING_LEGAL_COPY.debugHeading}
					</h2>
					<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
						{LLM_LOGGING_LEGAL_COPY.debugBody}
					</p>
				</section>
				<section className="grid gap-2">
					<h2 className="m-0 text-base font-semibold">
						{LLM_LOGGING_LEGAL_COPY.neverHeading}
					</h2>
					<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
						{LLM_LOGGING_LEGAL_COPY.neverBody}
					</p>
				</section>
			</section>
		</main>
	);
}
