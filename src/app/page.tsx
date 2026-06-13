import { cookies, headers } from "next/headers";
import LandingShell from "../components/landing/LandingShell";
import { LOCALE_COOKIE_NAME } from "../lib/auth/cookies";
import { resolveUiLocale } from "../lib/auth/locale";

export default async function Home() {
	const [requestHeaders, requestCookies] = await Promise.all([
		headers(),
		cookies(),
	]);
	const locale = resolveUiLocale({
		acceptLanguageHeader: requestHeaders.get("accept-language"),
		cookieLocale: requestCookies.get(LOCALE_COOKIE_NAME)?.value,
	});

	return <LandingShell locale={locale} />;
}
