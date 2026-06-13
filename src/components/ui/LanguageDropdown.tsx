"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { CSRF_COOKIE_NAME, LOCALE_COOKIE_NAME } from "../../lib/auth/cookies";
import { ensureCsrfToken } from "../../lib/auth/csrf-client";
import { LOCALES, type Locale } from "../../lib/i18n/types";

/**
 * The one and only language control in the product. Whatever the user picks is
 * THE language for everything: UI chrome, the coach's replies, the stored
 * record content of NEW incidents, and the exports.
 *
 * On change it always writes the `ssfw_locale` cookie (so anonymous and
 * pre-sign-in choices stick), additionally persists `user.uiLocale` via the
 * shared /api/user/locale route when signed in, then refreshes so the new
 * language takes effect server-side.
 */
export const localeNames: Record<Locale, string> = {
	de: "Deutsch",
	en: "English",
	fr: "Français",
	it: "Italiano",
};

const CSRF_HEADER_NAME = "x-ssfw-csrf";

type LanguageDropdownProps = {
	readonly locale: Locale;
	/**
	 * Whether to persist the choice to `user.uiLocale`. Defaults to true; pass
	 * false on the public landing page where there is no session.
	 */
	readonly signedIn?: boolean;
	readonly className?: string;
	/** Optional accessible label; falls back to a neutral "Language". */
	readonly ariaLabel?: string;
};

export default function LanguageDropdown({
	locale,
	signedIn = true,
	className,
	ariaLabel = "Language",
}: LanguageDropdownProps) {
	const router = useRouter();
	const generatedId = useId();
	const selectId = `language-dropdown-${generatedId}`;
	const [currentLocale, setCurrentLocale] = useState<Locale>(locale);
	const [isPending, startTransition] = useTransition();

	async function handleChange(nextValue: string) {
		if (!isLocale(nextValue) || nextValue === currentLocale) {
			return;
		}

		setCurrentLocale(nextValue);

		// Always set the cookie first so the choice survives even if the optional
		// signed-in persistence call fails.
		writeLocaleCookie(nextValue);

		if (signedIn) {
			try {
				await fetch("/api/user/locale", {
					body: JSON.stringify({ locale: nextValue }),
					credentials: "same-origin",
					headers: {
						"Content-Type": "application/json",
						[CSRF_HEADER_NAME]: ensureCsrfToken(CSRF_COOKIE_NAME),
					},
					method: "PATCH",
				});
			} catch {
				// The cookie is already written, so the language still switches on
				// refresh; the persisted preference simply catches up on the next
				// successful change. Nothing to surface.
			}
		}

		startTransition(() => {
			router.refresh();
		});
	}

	return (
		<label className="inline-flex items-center" htmlFor={selectId}>
			<span className="sr-only">{ariaLabel}</span>
			<select
				aria-label={ariaLabel}
				className={
					className ??
					"min-h-9 cursor-pointer rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)] outline-none transition-colors hover:border-[var(--color-accent)] focus-visible:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] disabled:cursor-wait disabled:opacity-70"
				}
				disabled={isPending}
				id={selectId}
				onChange={(event) => {
					void handleChange(event.target.value);
				}}
				value={currentLocale}
			>
				{LOCALES.map((option) => (
					<option key={option} value={option}>
						{localeNames[option]}
					</option>
				))}
			</select>
		</label>
	);
}

function isLocale(value: string): value is Locale {
	return (LOCALES as readonly string[]).includes(value);
}

function writeLocaleCookie(locale: Locale): void {
	const attributes = [
		`${LOCALE_COOKIE_NAME}=${locale}`,
		"Path=/",
		"SameSite=Lax",
		// One year — this is a durable preference, not a session token.
		"Max-Age=31536000",
	];

	if (window.location.protocol === "https:") {
		attributes.push("Secure");
	}

	// biome-ignore lint/suspicious/noDocumentCookie: client-readable locale preference shared with the server resolver.
	document.cookie = attributes.join("; ");
}
