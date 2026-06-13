"use client";

import { type FormEvent, useState } from "react";

const SUCCESS_MESSAGE = "Check your email for a sign-in link.";
const DEV_AUTH_BYPASS_ENABLED =
	process.env.NEXT_PUBLIC_SSFW_DEV_AUTH_BYPASS === "1";

export default function SigninPage() {
	const [email, setEmail] = useState("");
	const [message, setMessage] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isDevSubmitting, setIsDevSubmitting] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsSubmitting(true);
		setMessage("");

		try {
			const response = await fetch("/api/auth/magic-link/request", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ email }),
			});
			const payload = (await response.json().catch(() => null)) as {
				message?: string;
			} | null;

			setMessage(payload?.message ?? SUCCESS_MESSAGE);
		} catch {
			setMessage("Sign-in link could not be requested.");
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleDevSession() {
		setIsDevSubmitting(true);
		setMessage("");

		try {
			const returnTo =
				new URLSearchParams(window.location.search).get("returnTo") ??
				"/workspace";
			const response = await fetch("/api/auth/dev-session", {
				method: "POST",
				credentials: "same-origin",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ returnTo }),
			});
			const payload = (await response.json().catch(() => null)) as {
				message?: string;
				redirectTo?: string;
			} | null;

			if (!response.ok) {
				throw new Error(payload?.message ?? "DEV_SESSION_FAILED");
			}

			window.location.assign(payload?.redirectTo ?? "/workspace");
		} catch {
			setMessage("Development sign-in could not be started.");
		} finally {
			setIsDevSubmitting(false);
		}
	}

	return (
		<main
			style={{
				display: "flex",
				minHeight: "100vh",
				alignItems: "center",
				justifyContent: "center",
				padding: "1.5rem",
				fontFamily: "var(--font-sans)",
				color: "var(--color-text)",
			}}
		>
			<form
				onSubmit={handleSubmit}
				style={{
					display: "grid",
					width: "min(100%, 24rem)",
					gap: "0.875rem",
				}}
			>
				<div style={{ display: "grid", gap: "0.375rem" }}>
					<h1
						style={{
							fontSize: "var(--text-xl)",
							fontWeight: 500,
							margin: 0,
						}}
					>
						Sign in
					</h1>
					<p
						style={{
							color: "var(--color-muted)",
							fontSize: "var(--text-sm)",
							margin: 0,
						}}
					>
						Enter your email to receive a sign-in link.
					</p>
				</div>

				<label
					style={{
						display: "grid",
						gap: "0.375rem",
						fontSize: "var(--text-sm)",
					}}
				>
					Email
					<input
						autoComplete="email"
						inputMode="email"
						name="email"
						onChange={(event) => setEmail(event.target.value)}
						required
						style={{
							width: "100%",
							border: "1px solid var(--color-border)",
							borderRadius: "0.375rem",
							background: "var(--color-surface)",
							color: "var(--color-text)",
							font: "inherit",
							minHeight: "2.5rem",
							padding: "0 0.75rem",
						}}
						type="email"
						value={email}
					/>
				</label>

				<button
					disabled={isSubmitting}
					style={{
						border: "1px solid var(--color-accent)",
						borderRadius: "0.375rem",
						background: "var(--color-accent)",
						color: "#ffffff",
						cursor: isSubmitting ? "wait" : "pointer",
						font: "inherit",
						fontWeight: 500,
						minHeight: "2.5rem",
						opacity: isSubmitting ? 0.72 : 1,
					}}
					type="submit"
				>
					{isSubmitting ? "Sending..." : "Send sign-in link"}
				</button>

				{DEV_AUTH_BYPASS_ENABLED ? (
					<button
						disabled={isDevSubmitting}
						onClick={handleDevSession}
						style={{
							border: "1px solid var(--color-border)",
							borderRadius: "0.375rem",
							background: "var(--color-surface)",
							color: "var(--color-text)",
							cursor: isDevSubmitting ? "wait" : "pointer",
							font: "inherit",
							fontWeight: 500,
							minHeight: "2.5rem",
							opacity: isDevSubmitting ? 0.72 : 1,
						}}
						type="button"
					>
						{isDevSubmitting ? "Starting..." : "Use local test session"}
					</button>
				) : null}

				{message && (
					<p
						aria-live="polite"
						style={{
							color: "var(--color-muted)",
							fontSize: "var(--text-sm)",
							margin: 0,
						}}
					>
						{message}
					</p>
				)}

				<p
					style={{
						color: "var(--color-muted)",
						fontSize: "var(--text-sm)",
						margin: 0,
					}}
				>
					Company email domains share an incident list. Public email domains get
					a personal workspace.
				</p>
			</form>
		</main>
	);
}
