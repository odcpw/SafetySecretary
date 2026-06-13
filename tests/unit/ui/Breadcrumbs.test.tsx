import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	breadcrumbItems,
	ShellNavFixture,
} from "../../../src/components/ui/__fixtures__/shell-nav";
import Breadcrumbs from "../../../src/components/ui/Breadcrumbs";

test("Breadcrumbs renders an ordered list inside a breadcrumb nav", () => {
	const html = renderToStaticMarkup(<Breadcrumbs items={breadcrumbItems} />);

	assert.match(html, /<nav[^>]+aria-label="Breadcrumb"/);
	assert.match(html, /<ol\b/);
	assert.equal(countMatches(html, /<a\b/g), 2);
	assert.match(html, /aria-current="page"[^>]*>Pallet handling<\/span>/);
});

test("Breadcrumbs uses explicit current item when supplied", () => {
	const html = renderToStaticMarkup(
		<Breadcrumbs
			items={[
				{ href: "/workspace", label: "Dashboard" },
				{ href: "/workspace/incidents", isCurrent: true, label: "Incidents" },
				{ href: "/workspace/incidents/draft", label: "Draft" },
			]}
		/>,
	);

	assert.match(html, /aria-current="page"[^>]*>Incidents<\/span>/);
	assert.match(html, /href="\/workspace\/incidents\/draft"/);
});

test("Breadcrumbs truncates long trails with an inert ellipsis", () => {
	const html = renderToStaticMarkup(
		<Breadcrumbs
			items={[
				{ href: "/workspace", label: "Dashboard" },
				{ href: "/workspace/hiras", label: "HIRAs" },
				{ href: "/workspace/hiras/open", label: "Open" },
				{ href: "/workspace/hiras/open/1", label: "Pallet handling" },
			]}
			maxItems={3}
		/>,
	);

	assert.match(html, /Dashboard/);
	assert.doesNotMatch(html, />HIRAs</);
	assert.match(html, />\.\.\.</);
	assert.match(html, /aria-current="page"[^>]*>Pallet handling<\/span>/);
});

test("shell navigation fixture includes Breadcrumbs semantics", () => {
	const html = renderToStaticMarkup(<ShellNavFixture />);

	assert.match(html, /aria-label="Breadcrumb"/);
	assert.match(html, /Dashboard/);
	assert.match(html, /Pallet handling/);
});

function countMatches(source: string, pattern: RegExp): number {
	return source.match(pattern)?.length ?? 0;
}
