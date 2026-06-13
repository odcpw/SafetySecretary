"use client";

export function ensureCsrfToken(name: string): string {
	const existing = cookieValue(name);
	if (existing) {
		return existing;
	}

	const token = crypto.randomUUID();
	// biome-ignore lint/suspicious/noDocumentCookie: the app proxy expects a double-submit CSRF cookie.
	document.cookie = [
		`${name}=${encodeURIComponent(token)}`,
		"Path=/",
		"SameSite=Lax",
	].join("; ");

	const stored = cookieValue(name);
	if (!stored) {
		throw new Error("CSRF_COOKIE_WRITE_FAILED");
	}

	return stored;
}

function cookieValue(name: string): string | null {
	const prefix = `${name}=`;
	const match = document.cookie
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(prefix));

	return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}
