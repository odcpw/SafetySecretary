"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentStructuredOperation } from "../../../lib/agent/types";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
import type {
	CoachChatMessage,
	CoachOperationDecision,
} from "../../../lib/incident/coach-chat";
import {
	controlFailureLabel,
	dateTimeLabel,
	eventTypeLabel,
	hazardCategoryLabel,
	incidentTypeLabel,
	outcomeLabel,
	severityLabel,
	workTypeLabel,
} from "../../../lib/incident/labels";
import { causeMethodLabel } from "./CauseMethodToggle";
import { type CoachCopy, resolveCoachCopy } from "./copy";
import PhotoStrip from "./PhotoStrip";
import PushToTalkButton from "./PushToTalkButton";
import RecordPanel from "./RecordPanel";
import type { IncidentRecord } from "./types";

type CoachWorkbenchProps = {
	readonly incidentId: string;
	/** Locale for the static UI chrome (labels, buttons, hints). */
	readonly locale: string;
	/**
	 * Language the coach replies in and writes record content in. For an existing
	 * incident this is the incident's stored content_language so chat and record
	 * stay consistent; defaults to `locale` when not supplied.
	 */
	readonly replyLocale?: string;
};

type OperationSummary = {
	readonly title: string;
	readonly detail: string;
};

type ConversationFeedbackPayload = {
	readonly id: string;
	readonly incidentId: string;
	readonly rating: number;
	readonly comment: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
};

export default function CoachWorkbench({
	incidentId,
	locale,
	replyLocale,
}: CoachWorkbenchProps) {
	const copy = resolveCoachCopy(locale);
	const coachReplyLocale = replyLocale ?? locale;
	const [record, setRecord] = useState<IncidentRecord | null>(null);
	const [messages, setMessages] = useState<CoachChatMessage[]>([]);
	// Lives in a ref because sequential "Accept all" applies must see the
	// record ids of operations applied moments earlier in the same loop.
	const recordMapRef = useRef<Record<string, string>>({});
	const [input, setInput] = useState("");
	const [sending, setSending] = useState(false);
	const [busyOperationIds, setBusyOperationIds] = useState<Set<string>>(
		new Set(),
	);
	const [editing, setEditing] = useState<{
		operationId: string;
		text: string;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
	const [feedbackComment, setFeedbackComment] = useState("");
	const [feedbackSaving, setFeedbackSaving] = useState(false);
	const [feedbackSaved, setFeedbackSaved] = useState(false);
	const [feedbackError, setFeedbackError] = useState<string | null>(null);
	const [feedbackOpen, setFeedbackOpen] = useState(false);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const composerRef = useRef<HTMLTextAreaElement | null>(null);

	const refreshRecord = useCallback(async () => {
		const response = await fetch(
			`/api/incidents/${encodeURIComponent(incidentId)}/record`,
			{ credentials: "same-origin" },
		);

		if (response.ok) {
			const body = (await response.json()) as { record: IncidentRecord };
			setRecord(body.record);
		}
	}, [incidentId]);

	const refreshChat = useCallback(async () => {
		const response = await fetch(
			`/api/incidents/${encodeURIComponent(incidentId)}/coach/chat`,
			{ credentials: "same-origin" },
		);

		if (response.ok) {
			const body = (await response.json()) as { messages: CoachChatMessage[] };
			setMessages(body.messages);
			recordMapRef.current = recordMapFromMessages(body.messages);
		}
	}, [incidentId]);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			try {
				const [recordResponse, chatResponse, feedbackResponse] =
					await Promise.all([
						fetch(`/api/incidents/${encodeURIComponent(incidentId)}/record`, {
							credentials: "same-origin",
						}),
						fetch(
							`/api/incidents/${encodeURIComponent(incidentId)}/coach/chat`,
							{
								credentials: "same-origin",
							},
						),
						fetch(
							`/api/incidents/${encodeURIComponent(incidentId)}/coach/feedback`,
							{ credentials: "same-origin" },
						),
					]);

				if (cancelled) {
					return;
				}

				if (recordResponse.ok) {
					const body = (await recordResponse.json()) as {
						record: IncidentRecord;
					};
					setRecord(body.record);
				}

				if (chatResponse.ok) {
					const body = (await chatResponse.json()) as {
						messages: CoachChatMessage[];
					};
					setMessages(body.messages);
					recordMapRef.current = recordMapFromMessages(body.messages);
				}

				if (feedbackResponse.ok) {
					const body = (await feedbackResponse.json()) as {
						feedback: ConversationFeedbackPayload | null;
					};
					setFeedbackRating(body.feedback?.rating ?? null);
					setFeedbackComment(body.feedback?.comment ?? "");
				}
			} finally {
				if (!cancelled) {
					setLoaded(true);
				}
			}
		}

		void load();

		return () => {
			cancelled = true;
		};
	}, [incidentId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the newest message whenever the conversation grows.
	useEffect(() => {
		scrollRef.current?.scrollTo({
			behavior: "smooth",
			top: scrollRef.current.scrollHeight,
		});
	}, [messages, sending]);

	async function submitMessage(rawMessage: string): Promise<boolean> {
		const message = rawMessage.trim();

		if (!message || sending) {
			return false;
		}

		setSending(true);
		setError(null);

		const optimistic: CoachChatMessage = {
			content: message,
			createdAt: new Date().toISOString(),
			id: `optimistic-${Date.now()}`,
			operationDecisions: {},
			operations: [],
			role: "user",
		};
		setMessages((current) => [...current, optimistic]);

		try {
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(incidentId)}/coach/chat`,
				{
					body: JSON.stringify({ locale: coachReplyLocale, message }),
					credentials: "same-origin",
					headers: {
						"content-type": "application/json",
						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
					},
					method: "POST",
				},
			);
			const body = (await response.json().catch(() => ({}))) as {
				userMessage?: CoachChatMessage;
				assistantMessage?: CoachChatMessage;
				code?: string;
			};

			if (!response.ok || !body.assistantMessage || !body.userMessage) {
				throw new Error(body.code ?? `COACH_FAILED_${response.status}`);
			}

			const userMessage = body.userMessage;
			const assistantMessage = body.assistantMessage;
			setMessages((current) => [
				...current.filter((candidate) => candidate.id !== optimistic.id),
				userMessage,
				assistantMessage,
			]);
			return true;
		} catch (caught) {
			setMessages((current) =>
				current.filter((candidate) => candidate.id !== optimistic.id),
			);
			setError(userSafeError(caught, copy));
			return false;
		} finally {
			setSending(false);
			composerRef.current?.focus();
		}
	}

	async function send() {
		const message = input.trim();

		if (!message || sending) {
			return;
		}

		setInput("");
		const ok = await submitMessage(message);

		if (!ok) {
			setInput(message);
		}
	}

	async function submitFeedback() {
		if (!feedbackRating || feedbackSaving) {
			return;
		}

		setFeedbackSaving(true);
		setFeedbackSaved(false);
		setFeedbackError(null);

		try {
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(incidentId)}/coach/feedback`,
				{
					body: JSON.stringify({
						comment: feedbackComment,
						rating: feedbackRating,
					}),
					credentials: "same-origin",
					headers: {
						"content-type": "application/json",
						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
					},
					method: "POST",
				},
			);
			const body = (await response.json().catch(() => ({}))) as {
				feedback?: ConversationFeedbackPayload;
			};

			if (!response.ok || !body.feedback) {
				throw new Error(`FEEDBACK_FAILED_${response.status}`);
			}

			setFeedbackRating(body.feedback.rating);
			setFeedbackComment(body.feedback.comment ?? "");
			setFeedbackSaved(true);
		} catch {
			setFeedbackError(copy.conversation.feedbackError);
		} finally {
			setFeedbackSaving(false);
		}
	}

	// Switching the cause method on a case that already has causes posts a short
	// note into the chat, so the coach can offer to re-cast the existing tree into
	// the new method and fill its gaps (see SWITCHING METHOD in the skill prompt).
	// Empty cases stay silent: nothing to re-cast, the method just shapes the
	// questioning from here on.
	function handleMethodSwitch(nextMethod: string) {
		if (!record || record.causes.length === 0 || sending) {
			return;
		}

		void submitMessage(methodSwitchMessage(coachReplyLocale, nextMethod));
	}

	async function decide(
		message: CoachChatMessage,
		operation: AgentStructuredOperation,
		action: "apply" | "dismiss",
		editedText?: string,
	) {
		setBusyOperationIds((current) => new Set(current).add(operation.id));
		setError(null);

		try {
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(incidentId)}/coach/chat/apply`,
				{
					body: JSON.stringify({
						action,
						editedText,
						messageId: message.id,
						operationId: operation.id,
						operationRecordMap: recordMapRef.current,
					}),
					credentials: "same-origin",
					headers: {
						"content-type": "application/json",
						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
					},
					method: "POST",
				},
			);
			const body = (await response.json().catch(() => ({}))) as {
				applied?: { recordId?: string | null };
				code?: string;
			};

			if (!response.ok) {
				throw new Error(body.code ?? `APPLY_FAILED_${response.status}`);
			}

			const decision: CoachOperationDecision =
				action === "apply"
					? { recordId: body.applied?.recordId ?? null, status: "applied" }
					: { recordId: null, status: "dismissed" };

			setMessages((current) =>
				current.map((candidate) =>
					candidate.id === message.id
						? {
								...candidate,
								operationDecisions: {
									...candidate.operationDecisions,
									[operation.id]: decision,
								},
							}
						: candidate,
				),
			);

			if (action === "apply" && body.applied?.recordId) {
				recordMapRef.current = {
					...recordMapRef.current,
					[operation.id]: body.applied.recordId,
				};
			}

			if (action === "apply") {
				await refreshRecord();
			}
		} catch (caught) {
			setError(userSafeError(caught, copy));
		} finally {
			setBusyOperationIds((current) => {
				const next = new Set(current);
				next.delete(operation.id);
				return next;
			});
			setEditing((current) =>
				current?.operationId === operation.id ? null : current,
			);
		}
	}

	const appendTranscript = useCallback((text: string) => {
		const addition = text.trim();

		if (!addition) {
			return;
		}

		setInput((current) =>
			current.trim() ? `${current.trimEnd()} ${addition}` : addition,
		);
		composerRef.current?.focus();
	}, []);

	const causeStatements = new Map(
		(record?.causes ?? []).map((cause) => [cause.id, cause.statement]),
	);

	async function applyAll(message: CoachChatMessage) {
		for (const operation of message.operations) {
			const decision = message.operationDecisions[operation.id];

			if (!decision) {
				// Sequential on purpose: later operations may reference earlier ones.
				// eslint-disable-next-line no-await-in-loop
				await decide(message, operation, "apply");
			}
		}
	}

	return (
		<div className="grid min-h-0 gap-4 lg:max-h-[calc(100dvh-7rem)] lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
			<section
				aria-label={copy.conversation.ariaLabel}
				className="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] lg:min-h-0"
			>
				<header className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
					<div className="min-w-0">
						<h2 className="m-0 text-sm font-medium">
							{copy.conversation.heading}
						</h2>
						<p className="m-0 text-xs text-[var(--color-muted)]">
							{copy.conversation.subhead}
						</p>
					</div>
					<button
						aria-expanded={feedbackOpen}
						className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)]"
						onClick={() => {
							setFeedbackOpen((current) => !current);
							setFeedbackSaved(false);
						}}
						type="button"
					>
						{copy.conversation.feedbackButton}
					</button>
				</header>
				{feedbackOpen ? (
					<div className="border-b border-[var(--color-border)] px-4 py-3">
						<ConversationFeedback
							comment={feedbackComment}
							copy={copy}
							error={feedbackError}
							onClose={() => setFeedbackOpen(false)}
							onCommentChange={(comment) => {
								setFeedbackComment(comment);
								setFeedbackSaved(false);
							}}
							onRatingChange={(rating) => {
								setFeedbackRating(rating);
								setFeedbackSaved(false);
							}}
							onSubmit={() => void submitFeedback()}
							rating={feedbackRating}
							saved={feedbackSaved}
							saving={feedbackSaving}
						/>
					</div>
				) : null}
				<div
					className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
					ref={scrollRef}
				>
					<div className="grid gap-3">
						{messages.length === 0 && loaded ? (
							<WelcomeBlock
								copy={copy}
								onPick={(prompt) => {
									setInput(prompt);
									composerRef.current?.focus();
								}}
							/>
						) : null}
						{messages.map((message) => (
							<MessageBubble
								busyOperationIds={busyOperationIds}
								causeStatements={causeStatements}
								copy={copy}
								editing={editing}
								key={message.id}
								locale={locale}
								message={message}
								onApply={(operation, editedText) =>
									decide(message, operation, "apply", editedText)
								}
								onApplyAll={() => applyAll(message)}
								onDismiss={(operation) => decide(message, operation, "dismiss")}
								onEdit={(operation) =>
									setEditing({
										operationId: operation.id,
										text: primaryText(operation),
									})
								}
								onEditChange={(text) =>
									setEditing((current) =>
										current ? { ...current, text } : current,
									)
								}
								onEditCancel={() => setEditing(null)}
							/>
						))}
						{sending ? (
							<div className="justify-self-start rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2 text-sm text-[var(--color-muted)]">
								{copy.conversation.thinking}
							</div>
						) : null}
					</div>
				</div>
				{error ? (
					<p className="m-0 border-t border-[var(--color-danger)] px-4 py-2 text-sm text-[var(--color-danger)]">
						{error}
					</p>
				) : null}
				<PhotoStrip
					copy={copy}
					incidentId={incidentId}
					locale={locale}
					onChatRefresh={refreshChat}
				/>
				<div className="border-t border-[var(--color-border)] p-3">
					<div className="flex items-end gap-2">
						<textarea
							className="min-h-[2.75rem] max-h-40 flex-1 resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
							onChange={(event) => setInput(event.currentTarget.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									void send();
								}
							}}
							placeholder={copy.conversation.composerPlaceholder}
							ref={composerRef}
							rows={2}
							value={input}
						/>
						<PushToTalkButton
							copy={copy}
							disabled={sending}
							incidentId={incidentId}
							onTranscript={appendTranscript}
						/>
						<button
							className="inline-flex min-h-[2.75rem] items-center justify-center rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
							disabled={sending || !input.trim()}
							onClick={() => void send()}
							type="button"
						>
							{copy.conversation.send}
						</button>
					</div>
					<p className="m-0 mt-1 text-xs text-[var(--color-muted)]">
						{copy.conversation.composerHint}
					</p>
				</div>
			</section>
			<section
				aria-label={copy.conversation.recordAriaLabel}
				className="min-h-0 min-w-0 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 lg:max-h-[calc(100dvh-7rem)]"
			>
				{record ? (
					<RecordPanel
						copy={copy}
						locale={locale}
						onMethodSwitch={handleMethodSwitch}
						onRecordChange={() => void refreshRecord()}
						record={record}
					/>
				) : (
					<p className="m-0 text-sm text-[var(--color-muted)]">
						{loaded
							? copy.conversation.recordUnavailable
							: copy.conversation.loadingRecord}
					</p>
				)}
			</section>
		</div>
	);
}

// The chat note posted when the cause method is switched, written in the coach's
// reply language so the transcript stays coherent. It is a plain factual line —
// the OFFER to restructure comes from the coach (SWITCHING METHOD in the prompt),
// keeping the user in control rather than auto-rewriting their tree.
const METHOD_SWITCH_MESSAGE: Record<string, (label: string) => string> = {
	de: (label) => `Ich habe die Ursachenmethode auf ${label} umgestellt.`,
	en: (label) => `I've switched the cause method to ${label}.`,
	fr: (label) => `J'ai changé la méthode d'analyse des causes pour ${label}.`,
	it: (label) => `Ho cambiato il metodo di analisi delle cause in ${label}.`,
};

function methodSwitchMessage(locale: string, method: string): string {
	const base = locale.split("-")[0]?.toLowerCase() ?? "en";
	const build = METHOD_SWITCH_MESSAGE[base] ?? METHOD_SWITCH_MESSAGE.en;
	return build(causeMethodLabel(method, locale));
}

function WelcomeBlock({
	copy,
	onPick,
}: {
	copy: CoachCopy;
	onPick: (prompt: string) => void;
}) {
	const starterPrompts = [
		copy.conversation.starterPrompt1,
		copy.conversation.starterPrompt2,
	];

	return (
		<div className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-4 py-4">
			<p className="m-0 text-sm leading-6">{copy.conversation.welcomeBody}</p>
			<div className="grid gap-2">
				{starterPrompts.map((prompt) => (
					<button
						className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-sm text-[var(--color-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
						key={prompt}
						onClick={() => onPick(prompt)}
						type="button"
					>
						{prompt}
					</button>
				))}
			</div>
		</div>
	);
}

function ConversationFeedback({
	comment,
	copy,
	error,
	onClose,
	onCommentChange,
	onRatingChange,
	onSubmit,
	rating,
	saved,
	saving,
}: {
	comment: string;
	copy: CoachCopy;
	error: string | null;
	onClose: () => void;
	onCommentChange: (comment: string) => void;
	onRatingChange: (rating: number) => void;
	onSubmit: () => void;
	rating: number | null;
	saved: boolean;
	saving: boolean;
}) {
	const ratings = [1, 2, 3, 4];

	return (
		<div className="grid gap-3">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="grid gap-0.5">
					<p className="m-0 text-xs font-medium text-[var(--color-text)]">
						{copy.conversation.feedbackTitle}
					</p>
					<p className="m-0 text-xs text-[var(--color-muted)]">
						{copy.conversation.feedbackHint}
					</p>
				</div>
				<button
					className="inline-flex min-h-8 items-center justify-center rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
					disabled={saving}
					onClick={onClose}
					type="button"
				>
					{copy.conversation.feedbackClose}
				</button>
			</div>
			<fieldset className="m-0 flex items-center gap-1 border-0 p-0">
				<legend className="sr-only">{copy.conversation.feedbackTitle}</legend>
				{ratings.map((candidate) => {
					const active = rating !== null && candidate <= rating;
					return (
						<button
							aria-label={copy.conversation.feedbackStarLabel.replace(
								"{rating}",
								String(candidate),
							)}
							aria-pressed={rating === candidate}
							className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-base transition ${
								active
									? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
									: "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
							}`}
							disabled={saving}
							key={candidate}
							onClick={() => onRatingChange(candidate)}
							type="button"
						>
							{active ? "★" : "☆"}
						</button>
					);
				})}
			</fieldset>
			<div className="flex flex-col gap-2 sm:flex-row">
				<textarea
					className="min-h-16 flex-1 resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
					maxLength={2000}
					onChange={(event) => onCommentChange(event.currentTarget.value)}
					placeholder={copy.conversation.feedbackCommentPlaceholder}
					value={comment}
				/>
				<button
					className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--color-accent)] px-3 py-2 text-xs font-medium text-[var(--color-accent)] transition hover:bg-[var(--color-accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-60 sm:self-start"
					disabled={saving || !rating}
					onClick={onSubmit}
					type="button"
				>
					{saving
						? copy.conversation.feedbackSaving
						: copy.conversation.feedbackSave}
				</button>
			</div>
			{saved ? (
				<p className="m-0 text-xs text-[var(--color-success)]">
					{copy.conversation.feedbackSaved}
				</p>
			) : null}
			{error ? (
				<p className="m-0 text-xs text-[var(--color-danger)]">{error}</p>
			) : null}
		</div>
	);
}

function MessageBubble({
	message,
	busyOperationIds,
	causeStatements,
	copy,
	editing,
	locale,
	onApply,
	onApplyAll,
	onDismiss,
	onEdit,
	onEditChange,
	onEditCancel,
}: {
	message: CoachChatMessage;
	busyOperationIds: ReadonlySet<string>;
	causeStatements: ReadonlyMap<string, string>;
	copy: CoachCopy;
	editing: { operationId: string; text: string } | null;
	locale: string;
	onApply: (operation: AgentStructuredOperation, editedText?: string) => void;
	onApplyAll: () => void;
	onDismiss: (operation: AgentStructuredOperation) => void;
	onEdit: (operation: AgentStructuredOperation) => void;
	onEditChange: (text: string) => void;
	onEditCancel: () => void;
}) {
	const isUser = message.role === "user";
	const pendingOperations = message.operations.filter(
		(operation) => !message.operationDecisions[operation.id],
	);

	return (
		<div
			className={`grid gap-2 ${isUser ? "justify-items-end" : "justify-items-start"}`}
		>
			{/* For coach messages the captured items come first and the reply
			    text (which carries the next question) renders last, so the
			    question always sits nearest the composer. */}
			{message.operations.length > 0 ? (
				<div className="grid w-full max-w-[88%] gap-2">
					{message.operations.map((operation) => (
						<OperationCard
							busy={busyOperationIds.has(operation.id)}
							causeStatements={causeStatements}
							copy={copy}
							decision={message.operationDecisions[operation.id]}
							editing={editing?.operationId === operation.id ? editing : null}
							key={operation.id}
							locale={locale}
							onApply={(editedText) => onApply(operation, editedText)}
							onDismiss={() => onDismiss(operation)}
							onEdit={() => onEdit(operation)}
							onEditChange={onEditChange}
							onEditCancel={onEditCancel}
							operation={operation}
						/>
					))}
					{pendingOperations.length > 1 ? (
						<button
							className="justify-self-start rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] transition hover:bg-[var(--color-accent)] hover:text-white"
							onClick={onApplyAll}
							type="button"
						>
							{copy.conversation.acceptAll} {pendingOperations.length}
						</button>
					) : null}
				</div>
			) : null}
			<div
				className={`max-w-[88%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-6 ${
					isUser
						? "bg-[var(--color-accent)] text-white"
						: "border border-[var(--color-border)] bg-[var(--color-surface-elev)] text-[var(--color-text)]"
				}`}
			>
				{message.content}
			</div>
		</div>
	);
}

function OperationCard({
	operation,
	decision,
	busy,
	causeStatements,
	copy,
	editing,
	locale,
	onApply,
	onDismiss,
	onEdit,
	onEditChange,
	onEditCancel,
}: {
	operation: AgentStructuredOperation;
	decision: CoachOperationDecision | undefined;
	busy: boolean;
	causeStatements: ReadonlyMap<string, string>;
	copy: CoachCopy;
	editing: { operationId: string; text: string } | null;
	locale: string;
	onApply: (editedText?: string) => void;
	onDismiss: () => void;
	onEdit: () => void;
	onEditChange: (text: string) => void;
	onEditCancel: () => void;
}) {
	const summary = operationSummary(operation, copy, locale, causeStatements);
	const settled = decision?.status;

	return (
		<div
			className={`grid gap-2 rounded-md border px-3 py-2 ${
				settled
					? "border-[var(--color-border)] opacity-60"
					: "border-[var(--color-border)] bg-[var(--color-surface)]"
			}`}
		>
			<div className="flex flex-wrap items-baseline gap-2">
				<span className="text-xs font-medium uppercase tracking-wide text-[var(--color-accent)]">
					{summary.title}
				</span>
				{settled === "applied" ? (
					<span className="text-xs text-[var(--color-muted)]">
						{copy.conversation.inRecord}
					</span>
				) : null}
				{settled === "dismissed" ? (
					<span className="text-xs text-[var(--color-muted)]">
						{copy.conversation.dismissed}
					</span>
				) : null}
			</div>
			{editing ? (
				<div className="grid gap-2">
					<textarea
						className="min-h-20 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
						onChange={(event) => onEditChange(event.currentTarget.value)}
						value={editing.text}
					/>
					<div className="flex gap-2">
						<button
							className={cardPrimaryButton}
							disabled={busy || !editing.text.trim()}
							onClick={() => onApply(editing.text)}
							type="button"
						>
							{copy.conversation.acceptEdited}
						</button>
						<button
							className={cardSecondaryButton}
							disabled={busy}
							onClick={onEditCancel}
							type="button"
						>
							{copy.conversation.cancel}
						</button>
					</div>
				</div>
			) : (
				<>
					<p className="m-0 text-sm leading-6">{summary.detail}</p>
					{!settled ? (
						<div className="flex flex-wrap gap-2">
							<button
								className={cardPrimaryButton}
								disabled={busy}
								onClick={() => onApply()}
								type="button"
							>
								{busy ? copy.conversation.saving : copy.conversation.accept}
							</button>
							<button
								className={cardSecondaryButton}
								disabled={busy}
								onClick={onEdit}
								type="button"
							>
								{copy.conversation.edit}
							</button>
							<button
								className={cardSecondaryButton}
								disabled={busy}
								onClick={onDismiss}
								type="button"
							>
								{copy.conversation.dismiss}
							</button>
						</div>
					) : null}
				</>
			)}
		</div>
	);
}

const cardPrimaryButton =
	"inline-flex items-center justify-center rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const cardSecondaryButton =
	"inline-flex items-center justify-center rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60";

function operationSummary(
	operation: AgentStructuredOperation,
	copy: CoachCopy,
	locale: string,
	causeStatements?: ReadonlyMap<string, string>,
): OperationSummary {
	switch (operation.kind) {
		case "incident_field_update": {
			const payload = operation.payload;
			return {
				detail: `${fieldLabel(payload.field, copy)}: ${valueLabel(payload.field, payload.value, copy, locale)}`,
				title: copy.operations.recordDetail,
			};
		}

		case "timeline_event": {
			const payload = operation.payload;
			return {
				detail: payload.narrative ?? payload.title,
				title: payload.phase
					? `${copy.operations.story} · ${payload.phase}`
					: copy.operations.story,
			};
		}

		case "cause_node":
			return { detail: operation.payload.label, title: copy.operations.cause };

		case "cause_update": {
			const payload = operation.payload;
			const target = causeStatements?.get(payload.causeId);
			return {
				detail:
					payload.statement ??
					(target
						? `"${target.length > 90 ? `${target.slice(0, 89)}…` : target}"`
						: copy.operations.updateThisCause),
				title: `${copy.operations.causeUpdate}${causeBranchStatusSuffix(payload.branchStatus, copy)}`,
			};
		}

		case "stop_action": {
			const payload = operation.payload;
			return {
				detail: payload.title,
				title: `${copy.operations.measure} · ${payload.stopClass}${
					payload.purpose ? ` · ${payload.purpose}` : ""
				}`,
			};
		}

		case "hira_followup_note":
			return {
				detail: operation.payload.note,
				title: copy.operations.hiraFollowup,
			};

		case "fact":
			return { detail: operation.payload.text, title: copy.operations.fact };

		default:
			return { detail: primaryText(operation), title: operation.kind };
	}
}

function causeBranchStatusSuffix(
	branchStatus: string | undefined,
	copy: CoachCopy,
): string {
	switch (branchStatus) {
		case "ROOT_REACHED":
			return copy.operations.rootCauseSuffix;
		case "PARKED":
			return copy.operations.parkedSuffix;
		case "OPEN":
			return copy.operations.reopenedSuffix;
		default:
			return "";
	}
}

function primaryText(operation: AgentStructuredOperation): string {
	const payload = operation.payload as unknown as Record<string, unknown>;

	for (const key of ["value", "narrative", "label", "title", "note", "text"]) {
		const candidate = payload[key];

		if (typeof candidate === "string" && candidate.trim()) {
			return candidate;
		}

		if (typeof candidate === "number") {
			return String(candidate);
		}
	}

	return "";
}

function fieldLabel(field: string, copy: CoachCopy): string {
	const labels = copy.fields as Record<string, string>;
	return labels[field] ?? field;
}

function valueLabel(
	field: string,
	value: string | number | null,
	copy: CoachCopy,
	locale: string,
): string {
	if (value === null || value === "") {
		return copy.conversation.cleared;
	}

	const text = String(value);

	switch (field) {
		case "incidentType":
			return incidentTypeLabel(text, locale);
		case "actualInjuryOutcome":
			return outcomeLabel(text, locale);
		case "potentialSeverityCode":
			return severityLabel(text, locale);
		case "hazardCategoryCode":
			return hazardCategoryLabel(text, locale);
		case "eventType":
			return eventTypeLabel(text, locale);
		case "workType":
			return workTypeLabel(text, locale);
		case "controlFailure":
			return controlFailureLabel(text, locale);
		case "incidentAt":
			return dateTimeLabel(text) ?? text;
		default:
			return text;
	}
}

function recordMapFromMessages(
	messages: readonly CoachChatMessage[],
): Record<string, string> {
	const map: Record<string, string> = {};

	for (const message of messages) {
		for (const [operationId, decision] of Object.entries(
			message.operationDecisions,
		)) {
			if (decision.status === "applied" && decision.recordId) {
				map[operationId] = decision.recordId;
			}
		}
	}

	return map;
}

function userSafeError(caught: unknown, copy: CoachCopy): string {
	if (caught instanceof Error) {
		const map: Record<string, string> = {
			ALREADY_DECIDED: copy.chatErrors.alreadyDecided,
			CAUSE_NODE_REQUIRED: copy.chatErrors.causeNodeRequired,
			INVALID_FIELD_VALUE: copy.chatErrors.invalidFieldValue,
			INVALID_OPERATION: copy.chatErrors.invalidOperation,
			OPERATION_NOT_IN_MESSAGE: copy.chatErrors.operationNotInMessage,
			MONTHLY_CAP_EXCEEDED: copy.chatErrors.monthlyCapExceeded,
			PERSON_ACCOUNT_REQUIRED: copy.chatErrors.personAccountRequired,
			PROVIDER_FAILED: copy.chatErrors.providerFailed,
			UNRESOLVED_OPERATION_REFERENCE:
				copy.chatErrors.unresolvedOperationReference,
		};

		return map[caught.message] ?? caught.message;
	}

	return copy.chatErrors.generic;
}
