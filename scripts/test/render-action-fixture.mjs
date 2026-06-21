import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

const compiledRoot =
	process.env.SAFETYSECRETARY_ACTION_FIXTURE_BUILD_DIR ??
	process.env.SSFW_ACTION_FIXTURE_BUILD_DIR ??
	join(process.cwd(), ".tmp", "safetysecretary-action-fixture-test");
await writeFile(join(compiledRoot, "package.json"), '{"type":"module"}\n');
await patchExtensionlessImports(compiledRoot);

const [{ ActionBoardFixture }, { ACTION_BOARD_FIXTURES }] = await Promise.all([
	import(
		`file://${join(compiledRoot, "components/actions/__fixtures__/action-board.js")}`
	),
	import(`file://${join(compiledRoot, "lib/actions/fixtures.js")}`),
]);

const html = renderToStaticMarkup(ActionBoardFixture({ locale: "de" }));
const first = ACTION_BOARD_FIXTURES[0];

assertIncludes(html, "Aktionsboard", "German action board title should render");
assertIncludes(html, first.title.de, "German action title should render");
assertIncludes(html, "Aktionstitel", "German title field label should render");
assertIncludes(
	html,
	"Aktionsbeschreibung",
	"German description field label should render",
);
assertIncludes(html, "Status", "German status field label should render");
assertIncludes(
	html,
	"Anhaenge",
	"German attachments field label should render",
);
assertIncludes(
	html,
	"Ueberfaellige Aktionen",
	"German overdue metric should render",
);
assertIncludes(html, "Diese Woche faellig", "German due filter should render");
assertIncludes(html, "Noch keine Aktionen", "German empty state should render");
assertIncludes(
	html,
	"Keine passenden Aktionen",
	"German no-matches state should render",
);
assertIncludes(
	html,
	"Anhang hinzufuegen",
	"German add-attachment command should render",
);
assertIncludes(
	html,
	"Als erledigt markieren",
	"German action command should render",
);
assertIncludes(
	html,
	"Aktion schliessen",
	"German close-action command should render",
);
assertExcludes(
	html,
	first.title.en,
	"English fixture title must not render in DE fixture",
);

console.log(
	JSON.stringify({
		renderedLocale: "de",
		fixtureCount: ACTION_BOARD_FIXTURES.length,
	}),
);

async function patchExtensionlessImports(root) {
	const files = await jsFiles(root);
	await Promise.all(
		files.map(async (filePath) => {
			const source = await readFile(filePath, "utf8");
			const patched = source.replace(
				/from "(\.{1,2}\/[^"]+)"/g,
				(_match, specifier) => {
					if (/\.(cjs|js|json|mjs|node)$/.test(specifier)) {
						return `from "${specifier}"`;
					}
					return `from "${specifier}.js"`;
				},
			);
			if (patched !== source) {
				await writeFile(filePath, patched);
			}
		}),
	);
}

async function jsFiles(root) {
	const { readdir } = await import("node:fs/promises");
	const entries = await readdir(root, { recursive: true, withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
		.map((entry) => join(entry.parentPath, entry.name));
}

function assertIncludes(text, needle, message) {
	if (!text.includes(needle)) {
		throw new Error(message);
	}
}

function assertExcludes(text, needle, message) {
	if (text.includes(needle)) {
		throw new Error(message);
	}
}
