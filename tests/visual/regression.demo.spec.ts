import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type TestInfo, test } from "@playwright/test";

type ScreenshotPathTemplateInfo = TestInfo & {
	_projectInternal?: {
		expect?: {
			toHaveScreenshot?: {
				pathTemplate?: string;
			};
		};
	};
};

const visualSnapshotPathTemplate =
	"{testDir}/__snapshots__/{arg}{-projectName}{-snapshotSuffix}{ext}";
const regressionDemoSnapshotPathTemplate =
	"{testDir}/__snapshots__/regression-demo/{arg}{-projectName}{-snapshotSuffix}{ext}";
const regressionDemo =
	process.env.VISUAL_REGRESSION_DEMO === "1" ? test : test.skip;

test.beforeEach(({ browserName: _browserName }, testInfo) => {
	useVisualSnapshotDirectory(testInfo);
});

regressionDemo(
	"demonstrates screenshot failure when a token changes",
	async ({ page }) => {
		await page.setContent(`<!doctype html>
<html class="dark" lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<style>${readCompiledCss()}</style>
		<style>
			.dark {
				--color-accent: #ff004d;
				--color-surface: #241111;
			}

			body {
				background: var(--color-bg);
				margin: 0;
			}

			[data-visual-fixture-root] {
				background: var(--color-bg);
				color: var(--color-text);
				min-height: 100vh;
				padding: 16px;
			}
		</style>
	</head>
	<body>
		<div data-visual-fixture-root="buttons-regression-demo">
			<section aria-label="Button fixture" class="grid gap-4 bg-[var(--color-bg)] p-4 text-[var(--color-text)]">
				<button class="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-2 text-sm">Save HIRA</button>
			</section>
		</div>
	</body>
</html>`);

		await expect(page.locator("[data-visual-fixture-root]")).toHaveScreenshot(
			"buttons.png",
		);
	},
);

// Keep this bead's baselines in the committed snapshots directory without
// changing the shared Playwright config that was owned by ssfw-juu.
function useVisualSnapshotDirectory(testInfo: TestInfo): void {
	const internalProject = (testInfo as ScreenshotPathTemplateInfo)
		._projectInternal;

	if (!internalProject) {
		throw new Error("Playwright project internals unavailable.");
	}

	internalProject.expect ??= {};
	internalProject.expect.toHaveScreenshot ??= {};
	internalProject.expect.toHaveScreenshot.pathTemplate =
		process.env.VISUAL_REGRESSION_DEMO === "1"
			? regressionDemoSnapshotPathTemplate
			: visualSnapshotPathTemplate;
}

function readCompiledCss(): string {
	return listFiles(".next/static")
		.filter((file) => file.endsWith(".css"))
		.sort()
		.map((file) => readFileSync(file, "utf8"))
		.join("\n");
}

function listFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const filePath = join(directory, entry.name);

		if (entry.isDirectory()) {
			return listFiles(filePath);
		}

		return entry.isFile() ? [filePath] : [];
	});
}
