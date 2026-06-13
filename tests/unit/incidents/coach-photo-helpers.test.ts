import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !isLocalImport(specifier)) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}.tsx`, context.parentURL),
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
	COACH_PHOTO_CAPTION_MAX_LENGTH,
	COACH_PHOTO_EVENT_TEXT,
	COACH_PHOTO_EVENT_TIME_LABEL,
	clampCoachPhotoCaption,
	coachPhotoMessagePrefix,
} = (await import(
	"../../../src/lib/incident/coach-photos"
)) as typeof import("../../../src/lib/incident/coach-photos");

test("coach photo message prefix is locale-aware with and without filename", () => {
	assert.equal(
		coachPhotoMessagePrefix("en", "ramp.jpg"),
		'Looking at the photo "ramp.jpg": ',
	);
	assert.equal(coachPhotoMessagePrefix("en", null), "Looking at the photo: ");
	assert.equal(
		coachPhotoMessagePrefix("de", "rampe.jpg"),
		'Zum Foto "rampe.jpg": ',
	);
	assert.equal(coachPhotoMessagePrefix("de-CH", null), "Zum Foto: ");
	assert.equal(
		coachPhotoMessagePrefix("fr", "quai.png"),
		'En regardant la photo "quai.png" : ',
	);
	assert.equal(
		coachPhotoMessagePrefix("fr", null),
		"En regardant la photo : ",
	);
	assert.equal(
		coachPhotoMessagePrefix("it", "molo.png"),
		'Guardando la foto "molo.png": ',
	);
	assert.equal(coachPhotoMessagePrefix("it", null), "Guardando la foto: ");
});

test("coach photo message prefix falls back to English for unknown locales", () => {
	assert.equal(
		coachPhotoMessagePrefix("pt-BR", "doca.png"),
		'Looking at the photo "doca.png": ',
	);
	assert.equal(coachPhotoMessagePrefix("", null), "Looking at the photo: ");
});

test("coach photo captions are trimmed, blanked to null, and clamped", () => {
	assert.equal(clampCoachPhotoCaption(null), null);
	assert.equal(clampCoachPhotoCaption(""), null);
	assert.equal(clampCoachPhotoCaption("   \n\t "), null);
	assert.equal(
		clampCoachPhotoCaption("  Pallet blocking the walkway.  "),
		"Pallet blocking the walkway.",
	);

	const longCaption = "x".repeat(COACH_PHOTO_CAPTION_MAX_LENGTH + 500);
	assert.equal(
		clampCoachPhotoCaption(longCaption)?.length,
		COACH_PHOTO_CAPTION_MAX_LENGTH,
	);
});

test("coach photo evidence event markers stay stable for renderer filtering", () => {
	assert.equal(COACH_PHOTO_EVENT_TEXT, "Photo evidence");
	assert.equal(COACH_PHOTO_EVENT_TIME_LABEL, "Evidence");
});

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}
