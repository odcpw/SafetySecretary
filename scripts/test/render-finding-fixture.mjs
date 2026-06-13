import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

const compiledRoot =
	process.env.SSFW_FINDINGS_FIXTURE_BUILD_DIR ??
	join(process.cwd(), ".tmp", "ssfw-findings-fixture-test");
await writeFile(join(compiledRoot, "package.json"), '{"type":"module"}\n');
await patchExtensionlessImports(compiledRoot);

const [{ FindingListFixture }, { FINDING_FIXTURES }] = await Promise.all([
  import(`file://${join(compiledRoot, "components/findings/__fixtures__/finding-list.js")}`),
  import(`file://${join(compiledRoot, "lib/findings/fixtures.js")}`),
]);

const html = renderToStaticMarkup(FindingListFixture({ locale: "de" }));
const first = FINDING_FIXTURES[0];

assertIncludes(html, first.title.de, "German finding title should render");
assertIncludes(html, "Gute Beobachtung", "German good-catch badge should render");
assertIncludes(html, "keine Schuldzuweisung", "German no-blame note should render");
assertExcludes(html, first.title.en, "English fixture title must not render in DE fixture");

console.log(JSON.stringify({ renderedLocale: "de", fixtureCount: FINDING_FIXTURES.length }));

async function patchExtensionlessImports(root) {
  const files = await jsFiles(root);
  await Promise.all(
    files.map(async (filePath) => {
      const source = await readFile(filePath, "utf8");
      const patched = source.replace(/from "(\.{1,2}\/[^"]+)"/g, (_match, specifier) => {
        if (/\.(cjs|js|json|mjs|node)$/.test(specifier)) {
          return `from "${specifier}"`;
        }
        return `from "${specifier}.js"`;
      });
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
