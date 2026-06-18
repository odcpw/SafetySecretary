"use client";

import { useEffect } from "react";

const csrfHeaderName = "x-ssfw-csrf";

export function SubmitWithCsrfScript() {
	useEffect(() => {
		const handleSubmit = (event: SubmitEvent) => {
			const form = event.target;

			if (!(form instanceof HTMLFormElement)) {
				return;
			}

			if (!form.matches("[data-ssfw-csrf-form]")) {
				return;
			}

			event.preventDefault();
			void submitWithCsrf(form, event.submitter);
		};

		document.addEventListener("submit", handleSubmit);
		const state = window as Window & {
			__ssfwCsrfFormHandlerReady?: boolean;
		};
		state.__ssfwCsrfFormHandlerReady = true;

		return () => {
			document.removeEventListener("submit", handleSubmit);
			state.__ssfwCsrfFormHandlerReady = false;
		};
	}, []);

	return null;
}

async function submitWithCsrf(
	form: HTMLFormElement,
	submitter: HTMLElement | null,
): Promise<void> {
	const submitButton =
		submitter instanceof HTMLButtonElement
			? submitter
			: form.querySelector<HTMLButtonElement>("button[type='submit']");
	let csrfToken = "";

	try {
		csrfToken = ensureCsrfToken(form.dataset.csrfCookie || "ssfw_csrf");
	} catch {
		setStatus(form, form.dataset.errorMessage ?? "");
		return;
	}

	if (submitButton) {
		submitButton.disabled = true;
	}

	try {
		const response = await fetch(form.action, {
			body: JSON.stringify(formDataObject(form, submitter)),
			credentials: "same-origin",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				[csrfHeaderName]: csrfToken,
			},
			method: form.method || "POST",
		});

		if (!response.ok) {
			throw new Error("CSRF_FORM_FAILED");
		}

		if (response.redirected) {
			window.location.assign(response.url);
			return;
		}

		const payload = (await response.json().catch(() => null)) as
			| { incident?: { id?: unknown }; redirectTo?: unknown }
			| null;
		const redirectTo =
			typeof payload?.redirectTo === "string" ? payload.redirectTo : null;
		if (redirectTo) {
			window.location.assign(redirectTo);
			return;
		}

		const incidentId =
			typeof payload?.incident?.id === "string" ? payload.incident.id : null;

		if (incidentId) {
			window.location.assign(`/incidents/${incidentId}`);
			return;
		}

		if (response.url && response.url !== form.action) {
			window.location.assign(response.url);
			return;
		}

		window.location.assign(form.dataset.successUrl || window.location.href);
	} catch {
		setStatus(form, form.dataset.errorMessage ?? "");

		if (submitButton) {
			submitButton.disabled = false;
		}
	}
}

function formDataObject(
	form: HTMLFormElement,
	submitter: HTMLElement | null,
): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
	const formData =
		submitter instanceof HTMLElement
			? new FormData(form, submitter)
			: new FormData(form);
	const output: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};

	for (const [key, value] of formData.entries()) {
		const existing = output[key];

		if (Array.isArray(existing)) {
			existing.push(value);
		} else if (existing === undefined) {
			output[key] = value;
		} else {
			output[key] = [existing, value];
		}
	}

	return output;
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
	const cookie = document.cookie
		.split(";")
		.map((value) => value.trim())
		.find((value) => value.startsWith(prefix));

	return cookie ? cookie.slice(prefix.length) : "";
}

function setStatus(form: HTMLFormElement, message: string): void {
	const status = form.querySelector<HTMLElement>("[data-ssfw-csrf-form-status]");

	if (!status) {
		return;
	}

	status.textContent = message;
	status.hidden = false;
}
