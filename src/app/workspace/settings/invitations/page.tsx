"use client";

import { type FormEvent, useEffect, useState } from "react";
import { INVITATIONS_PAGE_COPY } from "../../../../lib/auth/invitation-copy";

type InvitationListItem = {
	id: string;
	recipientEmail: string;
	tenantName: string;
	expiresAt: string;
	consumedAt: string | null;
	createdByEmail?: string;
};

const csrfCookieName = "ssfw_csrf";

export default function InvitationsSettingsPage() {
	const [recipientEmail, setRecipientEmail] = useState("");
	const [invitations, setInvitations] = useState<InvitationListItem[]>([]);
	const [message, setMessage] = useState("");
	const [inviteUrl, setInviteUrl] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		let cancelled = false;

		async function loadInvitations() {
			const response = await fetch("/api/auth/invitations", {
				headers: { accept: "application/json" },
			});
			const payload = (await response.json().catch(() => null)) as {
				invitations?: InvitationListItem[];
				message?: string;
			} | null;

			if (cancelled) {
				return;
			}

			if (response.ok) {
				setInvitations(payload?.invitations ?? []);
				return;
			}

			setMessage(payload?.message ?? INVITATIONS_PAGE_COPY.loadError);
		}

		void loadInvitations();

		return () => {
			cancelled = true;
		};
	}, []);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsSubmitting(true);
		setMessage("");
		setInviteUrl("");

		try {
			const csrfToken = ensureCsrfToken(csrfCookieName);
			const response = await fetch("/api/auth/invitations", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-ssfw-csrf": csrfToken,
				},
				body: JSON.stringify({ recipientEmail }),
			});
			const payload = (await response.json().catch(() => null)) as {
				invitation?: InvitationListItem;
				inviteUrl?: string;
				message?: string;
			} | null;

			if (!response.ok) {
				setMessage(payload?.message ?? INVITATIONS_PAGE_COPY.submitError);
				return;
			}

			const createdInvitation = payload?.invitation;
			if (createdInvitation) {
				setInvitations((current) => [createdInvitation, ...current]);
			}
			setInviteUrl(payload?.inviteUrl ?? "");
			setMessage(payload?.message ?? INVITATIONS_PAGE_COPY.created);
			setRecipientEmail("");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<section className="grid w-full max-w-4xl gap-5">
			<header className="grid gap-2">
				<h1 className="m-0 text-xl font-semibold">
					{INVITATIONS_PAGE_COPY.title}
				</h1>
				<p className="m-0 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">
					{INVITATIONS_PAGE_COPY.description}
				</p>
			</header>

			<form
				className="grid gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
				onSubmit={handleSubmit}
			>
				<label className="grid gap-2 text-sm">
					{INVITATIONS_PAGE_COPY.recipientEmail}
					<input
						autoComplete="email"
						className="min-h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[var(--color-text)]"
						inputMode="email"
						name="recipientEmail"
						onChange={(event) => setRecipientEmail(event.target.value)}
						placeholder={INVITATIONS_PAGE_COPY.placeholder}
						required
						type="email"
						value={recipientEmail}
					/>
				</label>

				<button
					className="min-h-10 w-fit rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 font-medium text-white disabled:cursor-wait disabled:opacity-70"
					disabled={isSubmitting}
					type="submit"
				>
					{isSubmitting
						? INVITATIONS_PAGE_COPY.creating
						: INVITATIONS_PAGE_COPY.createButton}
				</button>

				{message ? (
					<p
						aria-live="polite"
						className="m-0 text-sm text-[var(--color-muted)]"
					>
						{message}
					</p>
				) : null}

				{inviteUrl ? (
					<p className="m-0 break-all rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm">
						{inviteUrl}
					</p>
				) : null}
			</form>

			<section className="grid gap-3">
				<h2 className="m-0 text-base font-semibold">
					{INVITATIONS_PAGE_COPY.openInvites}
				</h2>
				{invitations.length === 0 ? (
					<p className="m-0 text-sm text-[var(--color-muted)]">
						{INVITATIONS_PAGE_COPY.empty}
					</p>
				) : (
					<div className="overflow-hidden rounded-md border border-[var(--color-border)]">
						<table className="w-full border-separate border-spacing-0 text-left text-sm">
							<thead>
								<tr className="text-[var(--color-muted)]">
									<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium">
										{INVITATIONS_PAGE_COPY.emailColumn}
									</th>
									<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium">
										{INVITATIONS_PAGE_COPY.expiresColumn}
									</th>
									<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium">
										{INVITATIONS_PAGE_COPY.statusColumn}
									</th>
								</tr>
							</thead>
							<tbody>
								{invitations.map((invitation) => (
									<tr key={invitation.id}>
										<td className="border-b border-[var(--color-border)] px-3 py-2">
											{invitation.recipientEmail}
										</td>
										<td className="border-b border-[var(--color-border)] px-3 py-2 text-[var(--color-muted)]">
											{formatDate(invitation.expiresAt)}
										</td>
										<td className="border-b border-[var(--color-border)] px-3 py-2 text-[var(--color-muted)]">
											{invitation.consumedAt
												? INVITATIONS_PAGE_COPY.accepted
												: INVITATIONS_PAGE_COPY.pending}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</section>
	);
}

function ensureCsrfToken(cookieName: string): string {
	const existing = readCookie(cookieName);
	if (existing) {
		return existing;
	}

	const token = createToken();
	// biome-ignore lint/suspicious/noDocumentCookie: mirrors existing client CSRF form pattern.
	document.cookie = [`${cookieName}=${token}`, "Path=/", "SameSite=Lax"].join(
		"; ",
	);
	return token;
}

function readCookie(name: string): string | null {
	const prefix = `${name}=`;
	const value = document.cookie
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(prefix));

	return value ? decodeURIComponent(value.slice(prefix.length)) : null;
}

function createToken(): string {
	if (window.crypto && typeof window.crypto.randomUUID === "function") {
		return window.crypto.randomUUID();
	}

	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function formatDate(value: string): string {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}
