import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, type TestInfo, test } from "@playwright/test";
import { type ComponentType, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type FixtureDefinition = {
	id: string;
	sourceFile: string;
	exportName: string;
};

type ScreenshotPathTemplateInfo = TestInfo & {
	_projectInternal?: {
		expect?: {
			toHaveScreenshot?: {
				pathTemplate?: string;
			};
		};
	};
};

const compiledFixtureDir = join(
	tmpdir(),
	`ssfw-visual-fixtures-${process.pid}`,
);
const visualSnapshotPathTemplate =
	"{testDir}/__snapshots__/{arg}{-projectName}{-snapshotSuffix}{ext}";
const fixtureDirectories = [
	"src/components/ui/__fixtures__",
	"src/components/layout/__fixtures__",
] as const;

const fixtures: FixtureDefinition[] = [
	fixture(
		"buttons",
		"src/components/ui/__fixtures__/buttons.tsx",
		"ButtonsFixture",
	),
	fixture(
		"data-display",
		"src/components/ui/__fixtures__/data-display.tsx",
		"DataDisplayFixture",
	),
	fixture(
		"overlays",
		"src/components/ui/__fixtures__/overlays.tsx",
		"OverlaysFixture",
	),
	fixture(
		"pickers",
		"src/components/ui/__fixtures__/pickers.tsx",
		"PickerFixture",
	),
	fixture(
		"shell-nav",
		"src/components/ui/__fixtures__/shell-nav.tsx",
		"ShellNavFixture",
	),
	fixture(
		"status",
		"src/components/ui/__fixtures__/status.tsx",
		"StatusFixture",
	),
	fixture(
		"text-inputs",
		"src/components/ui/__fixtures__/text-inputs.tsx",
		"TextInputFixtures",
	),
	fixture(
		"layout-inspector",
		"src/components/layout/__fixtures__/inspector.tsx",
		"InspectorPanelFixture",
	),
	fixture(
		"layout-mobile-capture",
		"src/components/layout/__fixtures__/mobile-capture.tsx",
		"MobileCaptureLayoutFixture",
	),
	fixture(
		"layout-sticky-action-bar",
		"src/components/layout/__fixtures__/sticky-action-bar.tsx",
		"StickyActionBarFixture",
	),
	fixture(
		"layout-table-chat",
		"src/components/layout/__fixtures__/table-chat.tsx",
		"TableChatLayoutFixture",
	),
];

test.beforeAll(() => {
	compileFixtureModules();
});

test.afterAll(() => {
	rmSync(compiledFixtureDir, { force: true, recursive: true });
});

test.beforeEach(({ browserName: _browserName }, testInfo) => {
	useVisualSnapshotDirectory(testInfo);
});

test.describe("visual fixture baselines", () => {
	test("fixture registry covers every committed fixture file", () => {
		expect(fixtures.map((entry) => entry.sourceFile).sort()).toEqual(
			listFixtureFiles().sort(),
		);
	});

	for (const entry of fixtures) {
		test(entry.id, async ({ page }) => {
			await page.setContent(await fixtureDocument(entry));
			await expect(page.locator("[data-visual-fixture-root]")).toHaveScreenshot(
				`${entry.id}.png`,
			);
		});
	}
});

async function fixtureDocument(entry: FixtureDefinition): Promise<string> {
	const FixtureComponent = await loadFixtureComponent(entry);

	return `<!doctype html>
<html class="dark" lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<style>${readCompiledCss()}</style>
		<style>
			html,
			body {
				min-height: 100%;
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
		<div data-visual-fixture-root="${entry.id}">
			${renderToStaticMarkup(createElement(FixtureComponent))}
		</div>
	</body>
</html>`;
}

function listFixtureFiles(): string[] {
	return fixtureDirectories.flatMap((directory) =>
		readdirSync(directory, { withFileTypes: true })
			.filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
			.map((entry) => join(directory, entry.name).split(sep).join("/")),
	);
}

function compileFixtureModules(): void {
	rmSync(compiledFixtureDir, { force: true, recursive: true });
	execFileSync(
		"pnpm",
		[
			"exec",
			"tsc",
			"--ignoreConfig",
			"--outDir",
			compiledFixtureDir,
			"--rootDir",
			".",
			"--module",
			"Node16",
			"--moduleResolution",
			"Node16",
			"--target",
			"ES2022",
			"--lib",
			"dom,dom.iterable,esnext",
			"--jsx",
			"react-jsx",
			"--esModuleInterop",
			"--skipLibCheck",
			"--strict",
			"--types",
			"node",
			"--noEmit",
			"false",
			...listFixtureFiles(),
		],
		{ stdio: "inherit" },
	);
	symlinkSync(
		join(process.cwd(), "node_modules"),
		join(compiledFixtureDir, "node_modules"),
		"dir",
	);
}

async function loadFixtureComponent(
	entry: FixtureDefinition,
): Promise<ComponentType> {
	const modulePath = compiledModulePath(entry.sourceFile);
	const moduleExports = (await import(
		pathToFileURL(modulePath).href
	)) as Record<string, unknown>;
	const component = moduleExports[entry.exportName];

	if (typeof component !== "function") {
		throw new Error(
			`Expected ${entry.exportName} from ${entry.sourceFile} to be a component.`,
		);
	}

	return component as ComponentType;
}

function compiledModulePath(sourceFile: string): string {
	return `${compiledFixtureDir}/${sourceFile.replace(/\.tsx$/, ".js")}`;
}

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
		visualSnapshotPathTemplate;
}

function readCompiledCss(): string {
	const cssFiles = listFiles(".next/static")
		.filter((file) => file.endsWith(".css"))
		.sort();

	if (cssFiles.length === 0) {
		throw new Error(
			"Visual baselines need compiled app CSS. Run `pnpm build` before `pnpm test:visual`.",
		);
	}

	return cssFiles.map((file) => readFileSync(file, "utf8")).join("\n");
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

function fixture(
	id: string,
	sourceFile: string,
	exportName: string,
): FixtureDefinition {
	return {
		exportName,
		id,
		sourceFile: relative(".", sourceFile).split(sep).join("/"),
	};
}
