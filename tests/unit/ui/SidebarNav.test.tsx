import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	ShellNavFixture,
	shellNavItems,
} from "../../../src/components/ui/__fixtures__/shell-nav";
import SidebarNav from "../../../src/components/ui/SidebarNav";

test("SidebarNav renders nav items as anchors and marks the current page", () => {
	const html = renderToStaticMarkup(<SidebarNav items={shellNavItems} />);

	assert.match(html, /<nav[^>]+aria-label="Sidebar"/);
	assert.equal(countMatches(html, /<a\b/g), 3);
	assert.match(html, /href="\/workspace\/hiras"/);
	assert.match(html, /aria-current="page"/);
	assert.doesNotMatch(html, /<button[^>]+HIRAs/);
});

test("SidebarNav supports nested items without routing coupling", () => {
	const html = renderToStaticMarkup(
		<SidebarNav
			items={[
				{
					children: [{ href: "/workspace/hiras/open", label: "Open" }],
					href: "/workspace/hiras",
					label: "HIRAs",
				},
			]}
		/>,
	);

	assert.match(html, /href="\/workspace\/hiras"/);
	assert.match(html, /href="\/workspace\/hiras\/open"/);
	assert.doesNotMatch(html, /useRouter/);
});

test("shell navigation fixture includes SidebarNav semantics", () => {
	const html = renderToStaticMarkup(<ShellNavFixture />);

	assert.match(html, /aria-label="Sidebar"/);
	assert.match(html, /aria-current="page"/);
});

function countMatches(source: string, pattern: RegExp): number {
	return source.match(pattern)?.length ?? 0;
}
