import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const TEXT_PROP_NAMES = new Set([
	"aria-label",
	"errorText",
	"helperText",
	"label",
	"placeholder",
]);

const EXPLICIT_EMOJI = /(?:✨|🎉|🚀|❤️|🔥|🥳|🏆|🎯|⭐|🙌|👏|💪)/u;
const UNICODE_EMOJI = /\p{Extended_Pictographic}/u;

const BANNED_TEXT_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
	{ name: "cheerleading:Yay", pattern: /\bYay\b/i },
	{ name: "cheerleading:Awesome", pattern: /\bAwesome\b/i },
	{ name: "cheerleading:Great job", pattern: /\bGreat\s+job\b/i },
	{ name: "cheerleading:Crush it", pattern: /\bCrush\s+it\b/i },
	{ name: "cheerleading:Stay safe!", pattern: /\bStay\s+safe!/i },
	{ name: "gamification:Champion", pattern: /\bChampion\b/i },
	{ name: "gamification:Streak", pattern: /\bStreak\b/i },
	{ name: "gamification:Badge", pattern: /\bBadge\b/i },
	{ name: "gamification:XP", pattern: /\bXP\b/i },
	{ name: "gamification:Level up", pattern: /\bLevel\s+up\b/i },
	{ name: "cheerleading:Kudos", pattern: /\bKudos\b/i },
	{ name: "cheerleading:Rockstar", pattern: /\bRockstar\b/i },
	{ name: "cheerleading:Slay", pattern: /\bSlay\b/i },
	{ name: "locale-cheer:Super!", pattern: /\bSuper!/i },
	{ name: "locale-cheer:Top!", pattern: /\bTop!/i },
	{ name: "locale-cheer:Bravo!", pattern: /\bBravo!/i },
	{ name: "locale-cheer:Génial!", pattern: /\bGénial!/i },
	{ name: "locale-cheer:Forza!", pattern: /\bForza!/i },
	{ name: "locale-cheer:Bravissimo!", pattern: /\bBravissimo!/i },
	{ name: "locale-cheer:Stark!", pattern: /\bStark!/i },
];

export type CopyLintViolation = {
	filePath: string;
	rule: string;
	text: string;
	line: number;
	column: number;
};

export function lintUiCopyFiles(rootDir = process.cwd()): CopyLintViolation[] {
	const uiDir = path.join(rootDir, "src", "components", "ui");
	const violations: CopyLintViolation[] = [];

	for (const filePath of listTsxFiles(uiDir)) {
		const relativePath = path.relative(rootDir, filePath);
		const sourceText = readFileSync(filePath, "utf8");
		violations.push(...lintSourceText(relativePath, sourceText));
	}

	return violations;
}

export function lintSourceText(
	filePath: string,
	sourceText: string,
): CopyLintViolation[] {
	const sourceFile = ts.createSourceFile(
		filePath,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const violations: CopyLintViolation[] = [];

	function visit(node: ts.Node) {
		if (ts.isJsxText(node)) {
			checkText(sourceFile, violations, filePath, node.getStart(), node.getText());
		}

		if (ts.isJsxAttribute(node)) {
			const propName = node.name.getText(sourceFile);
			const value = staticAttributeValue(node.initializer);

			if (value && TEXT_PROP_NAMES.has(propName)) {
				checkText(sourceFile, violations, filePath, node.getStart(), value);
			}

			if (propName === "alt") {
				checkAltText(sourceFile, violations, filePath, node.getStart(), value);
			}
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return violations;
}

export function formatCopyLintViolations(
	violations: CopyLintViolation[],
): string {
	return violations
		.map(
			(violation) =>
				`${violation.filePath}:${violation.line}:${violation.column} ${violation.rule}: ${JSON.stringify(violation.text)}`,
		)
		.join("\n");
}

function listTsxFiles(dir: string): string[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const filePath = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			if (entry.name === "__fixtures__") {
				continue;
			}
			files.push(...listTsxFiles(filePath));
			continue;
		}

		if (entry.isFile() && filePath.endsWith(".tsx") && statSync(filePath).isFile()) {
			files.push(filePath);
		}
	}

	return files.sort();
}

function staticAttributeValue(
	initializer: ts.JsxAttribute["initializer"],
): string | undefined {
	if (!initializer) {
		return undefined;
	}

	if (ts.isStringLiteral(initializer)) {
		return initializer.text;
	}

	if (
		ts.isJsxExpression(initializer) &&
		initializer.expression &&
		ts.isStringLiteralLike(initializer.expression)
	) {
		return initializer.expression.text;
	}

	return undefined;
}

function checkText(
	sourceFile: ts.SourceFile,
	violations: CopyLintViolation[],
	filePath: string,
	position: number,
	rawText: string,
) {
	const text = normalise(rawText);

	if (!text) {
		return;
	}

	if (EXPLICIT_EMOJI.test(text) || UNICODE_EMOJI.test(text)) {
		pushViolation(sourceFile, violations, filePath, position, "emoji", text);
	}

	if (/^Submit\b/i.test(text)) {
		pushViolation(sourceFile, violations, filePath, position, "generic-submit", text);
	}

	if (text.endsWith("!")) {
		pushViolation(
			sourceFile,
			violations,
			filePath,
			position,
			"trailing-exclamation",
			text,
		);
	}

	for (const { name, pattern } of BANNED_TEXT_PATTERNS) {
		if (pattern.test(text)) {
			pushViolation(sourceFile, violations, filePath, position, name, text);
		}
	}
}

function checkAltText(
	sourceFile: ts.SourceFile,
	violations: CopyLintViolation[],
	filePath: string,
	position: number,
	value: string | undefined,
) {
	const text = normalise(value ?? "");

	if (!text || /\bdecorative\b/i.test(text)) {
		pushViolation(
			sourceFile,
			violations,
			filePath,
			position,
			"decorative-image-alt",
			text,
		);
	}
}

function pushViolation(
	sourceFile: ts.SourceFile,
	violations: CopyLintViolation[],
	filePath: string,
	position: number,
	rule: string,
	text: string,
) {
	const location = sourceFile.getLineAndCharacterOfPosition(position);
	violations.push({
		filePath,
		rule,
		text,
		line: location.line + 1,
		column: location.character + 1,
	});
}

function normalise(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}
