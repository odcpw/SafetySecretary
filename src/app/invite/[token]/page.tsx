import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "../../../lib/auth/cookies";
import { INVITE_PAGE_COPY } from "../../../lib/auth/invitation-copy";
import {
	INVITATION_ALREADY_USED_MESSAGE,
	INVITATION_EMAIL_MISMATCH_MESSAGE,
	INVITATION_EXPIRED_MESSAGE,
	INVITATION_INVALID_MESSAGE,
	InvitationValidationError,
	readInvitationLanding,
	redeemInvitationToken,
	requestInvitationMagicLink,
} from "../../../lib/auth/invitations";
import { validateSession } from "../../../lib/auth/session";
import { createEmailTransport } from "../../../lib/email/transport";

type InvitePageProps = {
	params: Promise<{ token: string }> | { token: string };
	searchParams?:
		| Promise<{ error?: string; sent?: string }>
		| { error?: string; sent?: string };
};

export default async function InvitePage({
	params,
	searchParams,
}: InvitePageProps) {
	const { token } = await Promise.resolve(params);
	const query = searchParams ? await Promise.resolve(searchParams) : {};
	const landing = await readInvitationLanding({ token });
	const session = await resolveSession();

	if (!landing.ok) {
		return (
			<InviteShell tenantName={landing.tenantName ?? INVITE_PAGE_COPY.appName}>
				<StatusMessage message={landing.message} />
			</InviteShell>
		);
	}

	return (
		<InviteShell tenantName={landing.tenantName}>
			<div className="grid gap-3">
				<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
					{INVITE_PAGE_COPY.invitedPrefix} {landing.tenantName}
					{"."} {INVITE_PAGE_COPY.boundPrefix} {landing.recipientEmail}
					{"."}
				</p>
				{query.sent ? (
					<StatusMessage message={INVITE_PAGE_COPY.checkEmail} />
				) : null}
				{query.error ? (
					<StatusMessage message={messageForError(query.error)} />
				) : null}
				{session ? (
					<form action={acceptInviteAction} className="grid gap-3">
						<input name="token" type="hidden" value={landing.token} />
						<button
							className="min-h-10 w-fit rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 font-medium text-white"
							type="submit"
						>
							{INVITE_PAGE_COPY.acceptButton}
						</button>
					</form>
				) : (
					<form action={sendInviteMagicLinkAction} className="grid gap-3">
						<input name="token" type="hidden" value={landing.token} />
						<button
							className="min-h-10 w-fit rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 font-medium text-white"
							type="submit"
						>
							{INVITE_PAGE_COPY.sendSignInButton}
						</button>
					</form>
				)}
				<Link className="text-sm text-[var(--color-accent)]" href="/signin">
					{INVITE_PAGE_COPY.useDifferentAccount}
				</Link>
			</div>
		</InviteShell>
	);
}

async function sendInviteMagicLinkAction(formData: FormData) {
	"use server";

	const token = stringValue(formData.get("token"));

	try {
		await requestInvitationMagicLink({
			token,
			magicLinkTransport: createEmailTransport(),
			baseUrl: await requestBaseUrl(),
			from: process.env.EMAIL_FROM ?? "no-reply@safetysecretary.local",
		});
	} catch (error) {
		redirect(inviteRedirect(token, errorCode(error)));
	}

	redirect(inviteRedirect(token, "sent"));
}

async function acceptInviteAction(formData: FormData) {
	"use server";

	const token = stringValue(formData.get("token"));
	const session = await resolveSession();

	if (!session) {
		redirect(`/signin?returnTo=${encodeURIComponent(`/invite/${token}`)}`);
	}

	const result = await redeemInvitationToken({
		token,
		userId: session.userId,
	});

	if (!result.ok) {
		redirect(inviteRedirect(token, result.reason));
	}

	redirect("/workspace");
}

async function resolveSession() {
	const requestCookies = await cookies();
	return validateSession(requestCookies.get(SESSION_COOKIE_NAME)?.value);
}

async function requestBaseUrl(): Promise<string> {
	if (process.env.APP_BASE_URL) {
		return process.env.APP_BASE_URL;
	}

	const requestHeaders = await headers();
	const host = requestHeaders.get("host") ?? "localhost:3000";
	const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
	return `${proto}://${host}`;
}

function InviteShell({
	children,
	tenantName,
}: {
	children: React.ReactNode;
	tenantName: string;
}) {
	return (
		<main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-6 text-[var(--color-text)]">
			<section className="grid w-full max-w-md gap-5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
				<header className="grid gap-2">
					<p className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
						{INVITE_PAGE_COPY.eyebrow}
					</p>
					<h1 className="m-0 text-xl font-semibold">{tenantName}</h1>
				</header>
				{children}
			</section>
		</main>
	);
}

function StatusMessage({ message }: { message: string }) {
	return (
		<p
			aria-live="polite"
			className="m-0 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm text-[var(--color-muted)]"
		>
			{message}
		</p>
	);
}

function inviteRedirect(token: string, state: string): string {
	const url = `/invite/${encodeURIComponent(token)}`;
	const params = new URLSearchParams();

	if (state === "sent") {
		params.set("sent", "1");
		return `${url}?${params.toString()}`;
	}

	params.set("error", state);
	return `${url}?${params.toString()}`;
}

function messageForError(error: string): string {
	if (error === "expired") {
		return INVITATION_EXPIRED_MESSAGE;
	}

	if (error === "used") {
		return INVITATION_ALREADY_USED_MESSAGE;
	}

	if (error === "mismatch") {
		return INVITATION_EMAIL_MISMATCH_MESSAGE;
	}

	return INVITATION_INVALID_MESSAGE;
}

function errorCode(error: unknown): string {
	if (error instanceof InvitationValidationError) {
		if (error.message === INVITATION_EXPIRED_MESSAGE) {
			return "expired";
		}

		if (error.message === INVITATION_ALREADY_USED_MESSAGE) {
			return "used";
		}
	}

	return "invalid";
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value : "";
}
