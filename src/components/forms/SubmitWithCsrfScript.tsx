"use client";

import { useEffect } from "react";
import { ensureCsrfToken } from "../../lib/auth/csrf-client";

const csrfHeaderName = "x-safetysecretary-csrf";

export function SubmitWithCsrfScript() {
	useEffect(() => {
		const handleSubmit = (event: SubmitEvent) => {
			const form = event.target;

			if (!(form instanceof HTMLFormElement)) {
				return;
			}

			if (
				!form.matches("[data-safetysecretary-csrf-form], [data-ssfw-csrf-form]")
			) {
				return;
			}

			event.preventDefault();
			void submitWithCsrf(form, event.submitter);
		};

		document.addEventListener("submit", handleSubmit);
		const state = window as Window & {
			__safetySecretaryCsrfFormHandlerReady?: boolean;
		};
		state.__safetySecretaryCsrfFormHandlerReady = true;

		return () => {
			document.removeEventListener("submit", handleSubmit);
			state.__safetySecretaryCsrfFormHandlerReady = false;
		};
	}, []);

	return null;
}

async function submitWithCsrf(
	form: HTMLFormElement,
	submitter: HTMLElement | null,
): Promise<void> {
	if (form.dataset.submitting === "true") {
		return;
	}

	const submitButton =
		submitter instanceof HTMLButtonElement
			? submitter
			: form.querySelector<HTMLButtonElement>("button[type='submit']");
	let csrfToken = "";

	try {
		csrfToken = ensureCsrfToken(
			form.dataset.csrfCookie || "safetysecretary_csrf",
		);
	} catch {
		setStatus(form, form.dataset.errorMessage ?? "");
		return;
	}

	if (submitButton) {
		submitButton.disabled = true;
	}
	form.dataset.submitting = "true";

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

		const payload = (await response.json().catch(() => null)) as {
			incident?: { id?: unknown };
			redirectTo?: unknown;
		} | null;
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
		delete form.dataset.submitting;
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

function setStatus(form: HTMLFormElement, message: string): void {
	const status =
		form.querySelector<HTMLElement>(
			"[data-safetysecretary-csrf-form-status]",
		) ?? form.querySelector<HTMLElement>("[data-ssfw-csrf-form-status]");

	if (!status) {
		return;
	}

	status.textContent = message;
	status.hidden = false;
}
