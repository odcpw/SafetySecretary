import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import ts from "typescript";

type FindingKind = "jsx-text" | "attribute" | "string" | "template";

type Finding = {
	file: string;
	kind: FindingKind;
	line: number;
	text: string;
};

const projectRoot = process.cwd();
const scanRoots = ["src/components/ui", "src/app"];
const sourceExtensions = new Set([".ts", ".tsx"]);
const userFacingAttributes = new Set([
	"aria-description",
	"aria-label",
	"alt",
	"placeholder",
	"title",
]);

const allowedExistingRawEnglish = new Set([
	// App-shell placeholders from ssfw-xsa/early auth beads. They are migrated as
	// their owning surfaces adopt t() and are intentionally visible to this test.
	key("src/app/layout.tsx", "string", "Safety Secretary"),
	key("src/app/layout.tsx", "string", "Safety Secretary application shell"),
	key("src/app/page.tsx", "attribute", "Safety Secretary"),
	key(
		"src/app/page.tsx",
		"attribute",
		"Application shell placeholder. Routes and data are wired in later beads.",
	),
	key("src/app/workspace/page.tsx", "attribute", "Workspace"),
	key(
		"src/app/workspace/page.tsx",
		"attribute",
		"Empty workspace. Tenant-aware content is wired in later beads.",
	),

	// Auth UI copy predates the catalog helper. ssfw-3da/eyp follow-ups should
	// replace these with t() while preserving the currently shipped behavior.
	key(
		"src/app/signin/page.tsx",
		"string",
		"If an account exists for that email, we sent a sign-in link.",
	),
	key(
		"src/app/signin/page.tsx",
		"string",
		"Sign-in link could not be requested.",
	),
	key("src/app/signin/page.tsx", "jsx-text", "Sign in"),
	key(
		"src/app/signin/page.tsx",
		"jsx-text",
		"Enter your email and we will send a passwordless sign-in link.",
	),
	key(
		"src/app/signin/page.tsx",
		"jsx-text",
		"Enter your work email to receive a sign-in link.",
	),
	key("src/app/signin/page.tsx", "jsx-text", "Email"),
	key("src/app/signin/page.tsx", "attribute", "you@example.com"),
	key("src/app/signin/page.tsx", "string", "Sending..."),
	key("src/app/signin/page.tsx", "string", "Send sign-in link"),
	key("src/app/signin/page.tsx", "jsx-text", "Need a workspace?"),
	key("src/app/signin/page.tsx", "jsx-text", "Create one"),
	key(
		"src/app/signup/page.tsx",
		"string",
		"Workspace created. Check your email for a sign-in link.",
	),
	key("src/app/signup/page.tsx", "string", "Workspace could not be created."),
	key("src/app/signup/page.tsx", "jsx-text", "Create workspace"),
	key(
		"src/app/signup/page.tsx",
		"jsx-text",
		"Create a company workspace and choose the default working language.",
	),
	key(
		"src/app/signup/page.tsx",
		"jsx-text",
		"Set up a company workspace and receive a sign-in link.",
	),
	key("src/app/signup/page.tsx", "jsx-text", "Email"),
	key("src/app/signup/page.tsx", "attribute", "you@example.com"),
	key("src/app/signup/page.tsx", "jsx-text", "Company name"),
	key("src/app/signup/page.tsx", "attribute", "Acme Safety"),
	key("src/app/signup/page.tsx", "jsx-text", "Default language"),
	key("src/app/signup/page.tsx", "string", "Français"),
	key("src/app/signup/page.tsx", "jsx-text", "Choose language"),
	key("src/app/signup/page.tsx", "string", "Creating..."),
	key("src/app/signup/page.tsx", "string", "Create workspace"),
	key("src/app/signup/page.tsx", "jsx-text", "Already have a workspace?"),
	key("src/app/signup/page.tsx", "jsx-text", "Sign in"),

	// Auth/API and approval vertical-slice response copy are not yet wired to the
	// catalog. Keep the allow-list explicit so new response strings are noticed.
	key(
		"src/app/api/auth/magic-link/request/route.ts",
		"string",
		"Enter a valid email address.",
	),
	key(
		"src/app/api/auth/magic-link/request/route.ts",
		"string",
		"Sign-in link could not be requested.",
	),
	key("src/app/api/auth/magic-link/verify/route.ts", "string", "Signed in."),
	key(
		"src/app/api/auth/signup/route.ts",
		"string",
		"Enter a valid email address.",
	),
	key(
		"src/app/api/auth/signup/route.ts",
		"string",
		"Sign-in link could not be requested.",
	),
	key(
		"src/app/api/incidents/[id]/approve/route.ts",
		"string",
		"Incident case id must be a UUID.",
	),
	key(
		"src/app/api/incidents/[id]/approve/route.ts",
		"string",
		"Authentication required.",
	),
	key(
		"src/app/api/incidents/[id]/approve/route.ts",
		"string",
		"Incident case was not found.",
	),
	key(
		"src/app/api/incidents/[id]/approve/route.ts",
		"string",
		"Incident approval snapshot could not be created.",
	),

	// Incident approval page is a temporary integration surface from snapshot
	// beads. Future workflow UI should move user-visible copy to t().
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"string",
		"Approval needs browser cryptography. Refresh and try again.",
	),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"string",
		"Approval could not store a CSRF token. Refresh and try again.",
	),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"string",
		"Approval needs a valid CSRF token. Refresh and try again.",
	),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"string",
		"Incident approval snapshot could not be created.",
	),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"attribute",
		"Incident approval",
	),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"jsx-text",
		"Incident approval",
	),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"jsx-text",
		"Incident case id must be a UUID.",
	),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"jsx-text",
		"Authentication required.",
	),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"jsx-text",
		"Incident case was not found.",
	),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"jsx-text",
		"Approve incident investigation",
	),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"jsx-text",
		"Approving freezes this incident investigation as an immutable v01/v02-style snapshot. Draft edits after approval continue into the next version.",
	),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"jsx-text",
		"Create approval snapshot",
	),
	key("src/app/incidents/[id]/approval/page.tsx", "jsx-text", "Approve as"),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"jsx-text",
		"Approving requires JavaScript so the CSRF header can be sent.",
	),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"jsx-text",
		"Approvals are immutable. Later draft edits create a new version.",
	),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"jsx-text",
		"Snapshot history",
	),
	key("src/app/incidents/[id]/approval/page.tsx", "jsx-text", "Past snapshots"),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"jsx-text",
		"No snapshots yet.",
	),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"jsx-text",
		"Selected immutable snapshot",
	),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"jsx-text",
		"read-only snapshot",
	),
	key("src/app/incidents/[id]/approval/page.tsx", "jsx-text", "Approved by"),
	key("src/app/incidents/[id]/approval/page.tsx", "jsx-text", "approved"),
	key("src/app/incidents/[id]/approval/page.tsx", "jsx-text", "Schema"),
	key("src/app/incidents/[id]/approval/page.tsx", "jsx-text", "Attachments"),
	key("src/app/incidents/[id]/approval/page.tsx", "jsx-text", "Artifacts"),

	// Shared UI primitive defaults/labels predate t(). New primitives should not
	// add more raw defaults without updating the catalog.
	key("src/components/ui/Breadcrumbs.tsx", "string", "Breadcrumb"),
	key("src/components/ui/Drawer.tsx", "attribute", "Close drawer"),
	key("src/components/ui/ErrorState.tsx", "string", "Retry"),
	key("src/components/ui/Modal.tsx", "attribute", "Close dialog"),
	key("src/components/ui/SidebarNav.tsx", "string", "Sidebar"),
	key("src/components/ui/SidebarNav.tsx", "string", "Collapse"),
	key("src/components/ui/SidebarNav.tsx", "string", "Expand"),
	key("src/components/ui/TopBar.tsx", "attribute", "Search"),
	key("src/components/ui/TopBar.tsx", "string", "Search"),
	key(
		"src/app/incidents/[id]/approval/page.tsx",
		"template",
		"II approval snapshots for ${} draft",
	),
	key("src/app/signup/page.tsx", "string", "Deutsch"),
	key("src/app/signup/page.tsx", "string", "English"),
	key("src/app/signup/page.tsx", "string", "Italiano"),
]);

test("core UI/app surfaces do not add raw English copy outside the allow-list", () => {
	const findings = scanRoots.flatMap((root) =>
		scanDirectory(join(projectRoot, root)),
	);
	const disallowed = findings.filter(
		(finding) =>
			!allowedExistingRawEnglish.has(
				key(finding.file, finding.kind, finding.text),
			),
	);

	assert.deepEqual(
		disallowed.map(formatFinding),
		[],
		"Route new user-visible strings through t(), or add a narrow allow-list entry with a migration comment for existing placeholder copy.",
	);
});

function scanDirectory(directory: string): Finding[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const absolutePath = join(directory, entry.name);

		if (entry.isDirectory()) {
			if (entry.name === "__fixtures__") {
				return [];
			}
			return scanDirectory(absolutePath);
		}

		if (!entry.isFile() || !sourceExtensions.has(extensionFor(entry.name))) {
			return [];
		}

		return scanFile(absolutePath);
	});
}

function scanFile(filePath: string): Finding[] {
	const sourceText = readFileSync(filePath, "utf8");
	const sourceFile = ts.createSourceFile(
		filePath,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
	const findings: Finding[] = [];

	function visit(node: ts.Node) {
		if (ts.isJsxText(node)) {
			record(node, "jsx-text", normalizeJsxText(node.getText(sourceFile)));
		}

		if (ts.isJsxAttribute(node)) {
			const initializer = node.initializer;
			const attributeName = node.name.getText(sourceFile);
			if (
				initializer &&
				ts.isStringLiteral(initializer) &&
				userFacingAttributes.has(attributeName)
			) {
				record(initializer, "attribute", initializer.text);
			}

			if (
				initializer &&
				ts.isJsxExpression(initializer) &&
				initializer.expression &&
				isStringLikeLiteral(initializer.expression) &&
				userFacingAttributes.has(attributeName)
			) {
				record(
					initializer.expression,
					"attribute",
					initializer.expression.text,
				);
			}
		}

		if (isStringLikeLiteral(node) && shouldScanStringLiteral(node)) {
			record(node, "string", node.text);
		}

		if (ts.isTemplateExpression(node) && shouldScanTemplateExpression(node)) {
			record(node, "template", templateExpressionText(node));
		}

		ts.forEachChild(node, visit);
	}

	function record(node: ts.Node, kind: FindingKind, text: string) {
		const normalized = normalizeText(text);

		if (
			!looksLikeUserFacingEnglish(
				normalized,
				treatsLowercaseTokenAsCopy(node, kind),
			)
		) {
			return;
		}

		const { line } = sourceFile.getLineAndCharacterOfPosition(
			node.getStart(sourceFile),
		);
		findings.push({
			file: toProjectPath(filePath),
			kind,
			line: line + 1,
			text: normalized,
		});
	}

	visit(sourceFile);
	return findings;
}

function shouldScanStringLiteral(
	node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
): boolean {
	const parent = node.parent;

	if (
		ts.isImportDeclaration(parent) ||
		ts.isExportDeclaration(parent) ||
		isDirectivePrologueLiteral(node) ||
		ts.isLiteralTypeNode(parent) ||
		ts.isJsxAttribute(parent)
	) {
		return false;
	}

	if (
		ts.isPropertyAssignment(parent) &&
		ts.isIdentifier(parent.name) &&
		nonCopyPropertyNames.has(parent.name.text)
	) {
		return false;
	}

	if (
		ts.isPropertyAccessExpression(parent) ||
		ts.isElementAccessExpression(parent) ||
		ts.isPropertySignature(parent)
	) {
		return false;
	}

	return true;
}

function shouldScanTemplateExpression(node: ts.TemplateExpression): boolean {
	const parent = node.parent;

	if (
		ts.isPropertyAssignment(parent) &&
		ts.isIdentifier(parent.name) &&
		nonCopyPropertyNames.has(parent.name.text)
	) {
		return false;
	}

	return true;
}

const nonCopyPropertyNames = new Set([
	"accept",
	"alignItems",
	"autoComplete",
	"background",
	"className",
	"color",
	"contentType",
	"credentials",
	"cursor",
	"display",
	"font",
	"fontFamily",
	"fontSize",
	"flexWrap",
	"inputMode",
	"justifyContent",
	"method",
	"name",
	"role",
	"type",
	"value",
]);

const nonCopyLiteralValues = new Set([
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"Content-Type",
	"End",
	"Enter",
	"Escape",
	"Home",
	"Input",
	"Retry-After",
	"Tab",
	"Textarea",
	"use server",
]);

function looksLikeUserFacingEnglish(
	text: string,
	treatLowercaseTokenAsCopy = false,
): boolean {
	if (text.length < 2 || text.length > 240) {
		return false;
	}

	if (!/[A-Za-z]/.test(text)) {
		return false;
	}

	if (nonCopyLiteralValues.has(text)) {
		return false;
	}

	if (
		/^(GET|POST|PATCH|DELETE|PUT|Path=|SameSite=|Secure$|nodejs$|application\/json$|text\/html$)/.test(
			text,
		)
	) {
		return false;
	}

	if (/^(x-|ssfw_|data-|aria-|button\[|userId$|tenantId$)/.test(text)) {
		return false;
	}

	if (/^[a-z][A-Za-z0-9_]*$/.test(text) && !treatLowercaseTokenAsCopy) {
		return false;
	}

	if (/^[a-z0-9_.:/@-]+$/.test(text) && !text.includes(" ")) {
		return treatLowercaseTokenAsCopy && /^[a-z]{2,}$/.test(text);
	}

	if (/^\/[A-Za-z0-9/_${}?=&.-]+$/.test(text) || /^\.[0-9]+Z$/.test(text)) {
		return false;
	}

	if (/^(SELECT|INSERT|UPDATE|DELETE)\b/i.test(text)) {
		return false;
	}

	if (
		/var\(--/.test(text) ||
		/(?:^|\s)(flex|grid|rounded|border|bg-|text-|px-|py-|gap-)/.test(text)
	) {
		return false;
	}

	if (
		looksLikeClassNameList(text) ||
		looksLikeCssValue(text) ||
		looksLikeSelector(text)
	) {
		return false;
	}

	return (
		/[A-Z][a-z]+/.test(text) ||
		(treatLowercaseTokenAsCopy && /^[a-z]{2,}$/.test(text)) ||
		/\s/.test(text) ||
		/[.!?]/.test(text)
	);
}

function treatsLowercaseTokenAsCopy(node: ts.Node, kind: FindingKind): boolean {
	if (kind === "jsx-text" || kind === "attribute") {
		return true;
	}

	if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) {
		return false;
	}

	const parent = node.parent;

	if (
		ts.isJsxExpression(parent) &&
		parent.expression === node &&
		(ts.isJsxElement(parent.parent) || ts.isJsxFragment(parent.parent))
	) {
		return true;
	}

	if (
		ts.isPropertyAssignment(parent) &&
		ts.isIdentifier(parent.name) &&
		copyPropertyNames.has(parent.name.text)
	) {
		return true;
	}

	if (
		ts.isVariableDeclaration(parent) &&
		ts.isIdentifier(parent.name) &&
		copyIdentifierPattern.test(parent.name.text)
	) {
		return true;
	}

	return false;
}

const copyPropertyNames = new Set([
	"description",
	"emptyText",
	"errorMessage",
	"helperText",
	"label",
	"message",
	"placeholder",
	"statusText",
	"subtitle",
	"title",
]);

const copyIdentifierPattern =
	/(copy|description|heading|label|message|placeholder|subtitle|title|text)$/i;

function isStringLikeLiteral(
	node: ts.Node,
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
	return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function isDirectivePrologueLiteral(
	node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
): boolean {
	return (
		node.text === "use client" &&
		ts.isExpressionStatement(node.parent) &&
		ts.isSourceFile(node.parent.parent)
	);
}

function looksLikeClassNameList(text: string): boolean {
	const tokens = text.split(/\s+/);
	return (
		tokens.length > 1 &&
		tokens.some((token) => /[-:[\]()./%]/.test(token)) &&
		tokens.every((token) =>
			/^-?[a-z0-9:[\]()./%_]+(?:-[a-z0-9:[\]()./%_]+)*$/i.test(token),
		)
	);
}

function looksLikeCssValue(text: string): boolean {
	return /^(?:\d+(?:\.\d+)?(?:rem|px|fr|%)?|0|auto|min\(.+\)|minmax\(.+\)|repeat\(.+\)|calc\(.+\))(?:\s+|$|,)/.test(
		text,
	);
}

function looksLikeSelector(text: string): boolean {
	return /[a-z][a-z-]*\[/.test(text) || text.includes("], ");
}

function normalizeJsxText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function normalizeText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function templateExpressionText(node: ts.TemplateExpression): string {
	return normalizeText(
		`${node.head.text}${node.templateSpans
			.map((span) => `\${}${span.literal.text}`)
			.join("")}`,
	);
}

function key(file: string, kind: FindingKind, text: string): string {
	return `${file}|${kind}|${normalizeText(text)}`;
}

function formatFinding(finding: Finding): string {
	return `${finding.file}:${finding.line} ${finding.kind} ${JSON.stringify(finding.text)}`;
}

function extensionFor(fileName: string): string {
	const match = fileName.match(/\.[^.]+$/);
	return match?.[0] ?? "";
}

function toProjectPath(filePath: string): string {
	return relative(projectRoot, filePath).split(sep).join("/");
}
