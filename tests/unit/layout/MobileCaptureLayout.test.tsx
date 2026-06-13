import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { chromium } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import Button from "../../../src/components/ui/Button";
import MobileCaptureLayout from "../../../src/components/layout/MobileCaptureLayout";
import { MobileCaptureLayoutFixture } from "../../../src/components/layout/__fixtures__/mobile-capture";

test("MobileCaptureLayout renders header, scrollable content, and sticky actions", () => {
	const html = renderLayout();

	assert.match(html, /aria-label="Mobile capture"/);
	assert.match(html, /Capture/);
	assert.match(html, /min-h-0 max-w-full flex-1 overflow-y-auto/);
	assert.match(html, /sticky bottom-0/);
	assert.match(html, /aria-label="Capture actions"/);
	assert.match(html, /Continue/);
});

test("MobileCaptureLayout keeps the root within a 375px viewport contract", () => {
	const html = renderLayout();

	assert.match(html, /w-full/);
	assert.match(html, /max-w-full/);
	assert.match(html, /overflow-hidden/);
	assert.doesNotMatch(html, /min-w-screen/);
	assert.doesNotMatch(html, /w-screen/);
});

test("MobileCaptureLayout mounted at 375px has no horizontal interactive overflow", async () => {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({
			viewport: { height: 667, width: 375 },
		});
		await page.setContent(browserDocument(renderInteractiveLayout(), builtCss()));

		const result = await page.evaluate(() => {
			const viewportWidth = window.innerWidth;
			const elements = [
				document.querySelector<HTMLElement>("[aria-label='Mobile capture']"),
				...document.querySelectorAll<HTMLElement>("button, a, input, textarea"),
			].filter((element): element is HTMLElement => Boolean(element));

			const overflow = elements
				.map((element) => {
					const rect = element.getBoundingClientRect();
					return {
						left: rect.left,
						right: rect.right,
						tagName: element.tagName,
						width: rect.width,
					};
				})
				.filter(
					(rect) =>
						rect.left < 0 ||
						rect.right > viewportWidth ||
						rect.width > viewportWidth,
				);
			const undersizedTargets = [
				...document.querySelectorAll<HTMLElement>("footer button, header button"),
			]
				.map((element) => {
					const rect = element.getBoundingClientRect();
					return {
						height: rect.height,
						label: element.textContent,
						width: rect.width,
					};
				})
				.filter((rect) => rect.height < 44 || rect.width < 44);

			return { overflow, undersizedTargets };
		});

		assert.deepEqual(result.overflow, []);
		assert.deepEqual(result.undersizedTargets, []);
	} finally {
		await browser.close();
	}
});

test("MobileCaptureLayout keeps action targets at least 44px", () => {
	const html = renderLayout();

	assert.match(html, /min-h-11/);
	assert.match(html, /\[&amp;&gt;button\]:min-h-11/);
	assert.match(html, /\[&amp;&gt;button\]:min-w-11/);
});

test("MobileCaptureLayout consumes dark tokens and has no hard-coded colours", () => {
	const html = renderLayout();

	assert.match(html, /var\(--color-bg\)/);
	assert.match(html, /var\(--color-surface\)/);
	assert.match(html, /var\(--color-border\)/);
	assert.match(html, /var\(--color-text\)/);
	assert.doesNotMatch(html, /#[0-9A-Fa-f]{3,8}/);
});

test("MobileCaptureLayout fixture is pure layout with no domain copy", () => {
	const html = renderToStaticMarkup(<MobileCaptureLayoutFixture />);

	assert.match(html, /aria-label="Capture fixture"/);
	assert.match(html, /Step 2 of 4/);
	assert.doesNotMatch(html, /HIRA|JHA|Incident/);
});

function renderLayout(): string {
	return renderToStaticMarkup(
		<MobileCaptureLayout
			actions={<Button>Continue</Button>}
			meta="Step 1"
			title="Capture"
		>
			<p>Content</p>
		</MobileCaptureLayout>,
	);
}

function renderInteractiveLayout(): string {
	return renderToStaticMarkup(
		<MobileCaptureLayout
			actions={
				<>
					<Button variant="secondary">Save draft</Button>
					<Button>Continue</Button>
				</>
			}
			headerAction={<Button variant="ghost">Close</Button>}
			meta="Step 1"
			title="Capture"
		>
			<label>
				<span>Observation</span>
				<textarea defaultValue="Describe what is visible." />
			</label>
		</MobileCaptureLayout>,
	);
}

function builtCss(): string {
	const cssRoot = path.resolve(".next", "static");
	if (!existsSync(cssRoot)) {
		throw new Error("Run pnpm build before the 375px browser layout check.");
	}

	const cssFiles = collectCssFiles(cssRoot);
	if (cssFiles.length === 0) {
		throw new Error("No built CSS files found under .next/static.");
	}

	return cssFiles.map((filePath) => readFileSync(filePath, "utf8")).join("\n");
}

function collectCssFiles(root: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const entryPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectCssFiles(entryPath));
		} else if (entry.isFile() && entry.name.endsWith(".css")) {
			files.push(entryPath);
		}
	}

	return files.sort();
}

function browserDocument(markup: string, css: string): string {
	return `<!doctype html>
<html class="dark">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
${css}
html,
body {
	height: 667px;
	overflow: hidden;
	width: 375px;
}
</style>
</head>
<body>${markup}</body>
</html>`;
}
