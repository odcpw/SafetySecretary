"use client";

import { Suspense, type FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CSRF_COOKIE_NAME } from "../../lib/auth/cookies";
import { normalizeLocalReturnTo } from "../../lib/auth/return-to";
import { acknowledgementText } from "../../lib/legal/disclaimer";
import { t } from "../../lib/i18n/t";
import { LOCALES, type Locale, type MessageKey } from "../../lib/i18n/types";

const COMMON_APP_NAME_KEY = ["common", "appName"].join(".") as MessageKey;
const ACTION_CONTINUE_KEY = ["action", "continue"].join(".") as MessageKey;
const CSRF_HEADER_NAME = "x-ssfw-csrf";

export default function DisclaimerPage() {
  return (
    <Suspense>
      <DisclaimerForm />
    </Suspense>
  );
}

function DisclaimerForm() {
  const searchParams = useSearchParams();
  const locale = parseLocale(searchParams.get("locale") ?? undefined);
  const returnTo = safeReturnTo(searchParams.get("returnTo") ?? undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const text = acknowledgementText(locale);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const form = event.currentTarget;
      const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
      const response = await fetch(
        `/api/legal/acknowledgement?returnTo=${encodeURIComponent(returnTo)}`,
        {
          body: new FormData(form),
          credentials: "same-origin",
          headers: { [CSRF_HEADER_NAME]: csrfToken },
          method: "POST",
        },
      );

      if (response.redirected) {
        window.location.assign(response.url);
        return;
      }

      if (response.ok) {
        window.location.assign(returnTo);
        return;
      }

      throw new Error("ACKNOWLEDGEMENT_POST_FAILED");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-2xl content-center gap-6 px-4 text-[var(--color-text)]">
      <section className="grid gap-5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] p-5 shadow-sm">
        <header className="grid gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
            {t(COMMON_APP_NAME_KEY, locale)}
          </p>
          <h1 className="m-0 text-xl font-semibold">
            {t(COMMON_APP_NAME_KEY, locale)}
          </h1>
        </header>

        <form className="grid gap-4" method="post" onSubmit={handleSubmit}>
          <label className="grid grid-cols-[1.25rem_1fr] gap-3 text-sm leading-6">
            <input
              className="mt-1 h-4 w-4"
              name="acknowledge"
              required
              type="checkbox"
              value="true"
            />
            <span>{text}</span>
          </label>
          <button
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium disabled:cursor-wait disabled:opacity-70"
            disabled={isSubmitting}
            type="submit"
          >
            {t(ACTION_CONTINUE_KEY, locale)}
          </button>
        </form>
      </section>
    </main>
  );
}

function parseLocale(value: string | undefined): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : "en";
}

function safeReturnTo(value: string | undefined): string {
  return normalizeLocalReturnTo(value);
}

function ensureCsrfToken(name: string): string {
  const existingToken = readCookie(name);

  if (existingToken) {
    return decodeURIComponent(existingToken);
  }

  const token = createCsrfToken();
  writeCookie(name, token);

  const storedToken = readCookie(name);
  if (!storedToken) {
    throw new Error("ACKNOWLEDGEMENT_CSRF_COOKIE_FAILED");
  }

  return decodeURIComponent(storedToken);
}

function readCookie(name: string): string {
  const prefix = `${name}=`;
  return (
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(prefix))
      ?.slice(prefix.length) ?? ""
  );
}

function writeCookie(name: string, value: string): void {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
  ];

  if (window.location.protocol === "https:") {
    attributes.push("Secure");
  }

  // biome-ignore lint/suspicious/noDocumentCookie: the app proxy expects a double-submit CSRF cookie.
  document.cookie = attributes.join("; ");
}

function createCsrfToken(): string {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
    throw new Error("ACKNOWLEDGEMENT_CSRF_UNAVAILABLE");
  }

  const bytes = Uint8Array.from({ length: 32 }, () => 0);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
