"use client";

import { Suspense, type FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ensureCsrfToken } from "../../lib/auth/csrf-client";
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
