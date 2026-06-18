export class AuthBaseUrlConfigurationError extends Error {
	readonly code = "AUTH_BASE_URL_REQUIRED";

	constructor() {
		super("APP_BASE_URL is required for emailed auth links.");
		this.name = "AuthBaseUrlConfigurationError";
	}
}

export function authBaseUrlForRequest(): string {
	const configured = process.env.APP_BASE_URL?.trim();

	if (configured) {
		return configured;
	}

	throw new AuthBaseUrlConfigurationError();
}
