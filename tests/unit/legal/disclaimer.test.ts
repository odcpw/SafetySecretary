import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !specifier.startsWith(".")) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}.tsx`, context.parentURL),
			new URL(`${specifier}.json`, context.parentURL),
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) => existsSync(candidate));

		if (resolved) {
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
});

const {
	ACKNOWLEDGEMENT_TEXT,
	ACKNOWLEDGEMENT_TEXT_KEY,
	DISCLAIMER_VERSION,
	EXPORT_FOOTER_TEXT,
	EXPORT_FOOTER_TEXT_KEY,
	acknowledgementText,
	exportFooterText,
} = await import("../../../src/lib/legal/disclaimer");
const { LOCALES } = await import("../../../src/lib/i18n/types");
const { t } = await import("../../../src/lib/i18n/t");

test("legal copy is served from message catalogs for every locale", () => {
	for (const locale of LOCALES) {
		assert.equal(
			ACKNOWLEDGEMENT_TEXT[locale],
			t(ACKNOWLEDGEMENT_TEXT_KEY, locale),
		);
		assert.equal(EXPORT_FOOTER_TEXT[locale], t(EXPORT_FOOTER_TEXT_KEY, locale));
		assert.equal(acknowledgementText(locale), ACKNOWLEDGEMENT_TEXT[locale]);
		assert.equal(exportFooterText(locale), EXPORT_FOOTER_TEXT[locale]);
	}
});

test("acknowledgement copy includes required legal, logging, and vision posture", () => {
	const requiredByLocale = {
		de: [
			"keine Rechtsberatung",
			"LLM-Prompts und LLM-Antworten werden standardmaessig nicht protokolliert",
			"tenant_id",
			"Modell",
			"Tokenzahlen",
			"Kosten",
			"Latenz",
			"Fehlercodes",
			"LLM_DEBUG_LOG=1",
			"Cloud-Vision ist auf Firmenebene standardmaessig ausgeschaltet",
			"bevor ein Foto an irgendeinen Anbieter gesendet wird, einschliesslich lokaler Anbieter",
		],
		en: [
			"guidance tool, not legal advice",
			"LLM prompt and response bodies are not logged by default",
			"tenant_id",
			"model",
			"token counts",
			"cost",
			"latency",
			"error codes",
			"LLM_DEBUG_LOG=1",
			"Cloud vision is off by default at company level",
			"before any photo is sent to any provider, including local",
		],
		fr: [
			"pas un conseil juridique",
			"Les prompts LLM et les reponses LLM ne sont pas journalises par defaut",
			"tenant_id",
			"modele",
			"nombres de tokens",
			"cout",
			"latence",
			"codes d'erreur",
			"LLM_DEBUG_LOG=1",
			"La vision cloud est desactivee par defaut au niveau de l'entreprise",
			"avant qu'une photo soit envoyee a n'importe quel fournisseur, y compris un fournisseur local",
		],
		it: [
			"non una consulenza legale",
			"I prompt LLM e le risposte LLM non vengono registrati per impostazione predefinita",
			"tenant_id",
			"modello",
			"conteggi dei token",
			"costo",
			"latenza",
			"codici di errore",
			"LLM_DEBUG_LOG=1",
			"La visione cloud e disattivata per impostazione predefinita a livello aziendale",
			"prima che una foto sia inviata a qualsiasi fornitore, incluso un fornitore locale",
		],
	};

	for (const locale of LOCALES) {
		for (const required of requiredByLocale[locale]) {
			assert.ok(
				ACKNOWLEDGEMENT_TEXT[locale].includes(required),
				`${locale} acknowledgement should include: ${required}`,
			);
		}
	}
});

test("export footer copy is short and separate from acknowledgement copy", () => {
	for (const locale of LOCALES) {
		assert.ok(
			EXPORT_FOOTER_TEXT[locale].length < 280,
			`${locale} export footer should fit Office/PDF footers`,
		);
		assert.notEqual(EXPORT_FOOTER_TEXT[locale], ACKNOWLEDGEMENT_TEXT[locale]);
	}
});

test("disclaimer version is tied to the localized copy payload", () => {
	const expectedHash = copyHash();

	assert.match(DISCLAIMER_VERSION, /^\d+\.\d+\.\d+\+[a-f0-9]{8}$/);
	assert.equal(
		DISCLAIMER_VERSION.split("+")[1],
		expectedHash,
		"changing acknowledgement/footer copy requires a DISCLAIMER_VERSION bump",
	);
});

test("user acknowledgement schema and raw SQL migration agree", () => {
	const prismaSchema = readFileSync("prisma/schema.prisma", "utf8");
	const sqlMigration = readFileSync(
		"db/sql/00050_user_acknowledgements.sql",
		"utf8",
	);
	const sqlDownMigration = readFileSync(
		"db/sql/down/00050_user_acknowledgements.down.sql",
		"utf8",
	);

	assert.match(prismaSchema, /model UserAcknowledgement \{/);
	assert.match(prismaSchema, /@@map\("user_acknowledgements"\)/);
	assert.match(prismaSchema, /@@schema\("shared"\)/);
	assert.match(prismaSchema, /@@unique\(\[userId, disclaimerVersion\]/);

	assert.match(
		sqlMigration,
		/CREATE TABLE IF NOT EXISTS "shared"\."user_acknowledgements"/,
	);
	assert.match(sqlMigration, /"disclaimer_version" TEXT NOT NULL/);
	assert.match(
		sqlMigration,
		/"acknowledged_at" TIMESTAMPTZ\(6\) NOT NULL DEFAULT CURRENT_TIMESTAMP/,
	);
	assert.match(
		sqlMigration,
		/"user_acknowledgements_user_id_disclaimer_version_key"/,
	);
	assert.match(
		sqlMigration,
		/FOREIGN KEY \("user_id"\) REFERENCES "shared"\."users"\("id"\)/,
	);
	assert.match(
		sqlDownMigration,
		/DROP TABLE IF EXISTS "shared"\."user_acknowledgements"/,
	);
});

function copyHash(): string {
	const payload = LOCALES.flatMap((locale) => [
		locale,
		ACKNOWLEDGEMENT_TEXT[locale],
		EXPORT_FOOTER_TEXT[locale],
	]).join("\0");

	return createHash("sha256").update(payload).digest("hex").slice(0, 8);
}
