"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { t } from "../../lib/i18n/t";
import { LOCALES, type Locale } from "../../lib/i18n/types";
import Select from "./Select";

const CSRF_COOKIE_NAME = "ssfw_csrf";
const CSRF_HEADER_NAME = "x-ssfw-csrf";

export type LocaleSwitcherProps = {
	locale: Locale;
	endpoint?: string;
	disabled?: boolean;
	id?: string;
	className?: string;
	onLocaleChange?: (locale: Locale) => void;
};

export function LocaleSwitcher({
	locale,
	endpoint = "/api/user/locale",
	disabled = false,
	id,
	className,
	onLocaleChange,
}: LocaleSwitcherProps) {
	const generatedId = useId();
	const selectId = id ?? `locale-switcher-${generatedId}`;
	const [currentLocale, setCurrentLocale] = useState(locale);
	const [isSaving, setIsSaving] = useState(false);
	const [hasError, setHasError] = useState(false);
	const options = useMemo(
		() =>
			LOCALES.map((optionLocale) => ({
				label: localeLabel(optionLocale, currentLocale),
				value: optionLocale,
			})),
		[currentLocale],
	);

	useEffect(() => {
		setCurrentLocale(locale);
	}, [locale]);

	async function handleLocaleChange(nextValue: string) {
		if (!isLocale(nextValue) || nextValue === currentLocale) {
			return;
		}

		const previousLocale = currentLocale;
		setCurrentLocale(nextValue);
		setIsSaving(true);
		setHasError(false);

		try {
			const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
			const response = await fetch(endpoint, {
				body: JSON.stringify({ locale: nextValue }),
				credentials: "same-origin",
				headers: {
					"Content-Type": "application/json",
					[CSRF_HEADER_NAME]: csrfToken,
				},
				method: "PATCH",
			});

			if (!response.ok) {
				throw new Error(`LOCALE_UPDATE_FAILED_${response.status}`);
			}

			onLocaleChange?.(nextValue);
		} catch {
			setCurrentLocale(previousLocale);
			setHasError(true);
		} finally {
			setIsSaving(false);
		}
	}

	return (
		<Select
			aria-label={t("auth.language.label", currentLocale)}
			className={className}
			disabled={disabled || isSaving}
			error={hasError ? t("error.generic.title", currentLocale) : undefined}
			id={selectId}
			label={t("auth.language.label", currentLocale)}
			onChange={(value) => {
				void handleLocaleChange(value);
			}}
			options={options}
			value={currentLocale}
		/>
	);
}

export default LocaleSwitcher;

export function isLocale(value: string): value is Locale {
	return (LOCALES as readonly string[]).includes(value);
}

function localeLabel(locale: Locale, displayLocale: Locale): string {
	return (
		new Intl.DisplayNames([displayLocale], { type: "language" }).of(locale) ??
		locale.toUpperCase()
	);
}

// The token is server-minted, session-bound, and re-issued by the proxy, so the
// client only reads it (preferring the __Host- carrier) and never mints.
function ensureCsrfToken(name: string): string {
	const token = readCookie("__Host-ssfw_csrf") || readCookie(name);

	if (!token) {
		throw new Error("CSRF_COOKIE_MISSING");
	}

	return decodeURIComponent(token);
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
