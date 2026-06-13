import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import Button from "../../../src/components/ui/Button";
import IconButton from "../../../src/components/ui/IconButton";
import {
	StickyActionBar,
	type StickyActionBarProps,
} from "../../../src/components/layout/StickyActionBar";
import { StickyActionBarFixture } from "../../../src/components/layout/__fixtures__/sticky-action-bar";

test("StickyActionBar renders toolbar semantics and slots", () => {
	const html = renderBar();

	assert.match(html, /role="toolbar"/);
	assert.match(html, /aria-label="Workflow actions"/);
	assert.match(html, /Back/);
	assert.match(html, /Draft saved/);
	assert.match(html, /Approve/);
	assert.ok(html.indexOf("Back") < html.indexOf("Draft saved"));
	assert.ok(html.indexOf("Draft saved") < html.indexOf("Approve"));
});

test("StickyActionBar defaults to mobile bottom and desktop top pinning", () => {
	const html = renderBar();

	assert.match(html, /fixed/);
	assert.match(html, /bottom-0/);
	assert.match(html, /lg:top-0/);
	assert.match(html, /lg:bottom-auto/);
	assert.match(html, /lg:border-b/);
});

test("StickyActionBar supports explicit top and bottom positions", () => {
	const top = renderBar({ position: "top" });
	const bottom = renderBar({ position: "bottom" });

	assert.match(top, /top-0/);
	assert.match(top, /border-b/);
	assert.doesNotMatch(top, /bottom-0/);
	assert.match(bottom, /bottom-0/);
	assert.match(bottom, /border-t/);
	assert.doesNotMatch(bottom, /lg:top-0/);
});

test("StickyActionBar keeps mobile action targets at least 44px high", () => {
	const html = renderBar();

	assert.match(html, /min-h-11/);
	assert.match(html, /\[&amp;&gt;button\]:min-h-11/);
});

test("StickyActionBar enforces 44px width for icon-only actions", () => {
	const html = renderToStaticMarkup(
		<StickyActionBar
			aria-label="Workflow actions"
			primaryAction={<IconButton aria-label="Approve" icon="A" />}
			secondaryAction={<IconButton aria-label="Back" icon="B" />}
		/>,
	);

	assert.match(html, /\[&amp;&gt;button\]:min-w-11/);
	assert.match(html, /aria-label="Approve"/);
	assert.match(html, /aria-label="Back"/);
});

test("StickyActionBar consumes design tokens and avoids hard-coded colours", () => {
	const html = renderBar();

	assert.match(html, /var\(--color-border\)/);
	assert.match(html, /var\(--color-surface\)/);
	assert.match(html, /var\(--color-text\)/);
	assert.doesNotMatch(html, /#[0-9A-Fa-f]{3,8}/);
});

test("StickyActionBar fixture renders one toolbar", () => {
	const html = renderToStaticMarkup(<StickyActionBarFixture />);

	assert.equal(countMatches(html, /role="toolbar"/g), 1);
	assert.match(html, /aria-label="Sticky action bar fixture"/);
	assert.match(html, /aria-label="Workflow actions"/);
});

function renderBar(props: Partial<StickyActionBarProps> = {}): string {
	return renderToStaticMarkup(
		<StickyActionBar
			aria-label="Workflow actions"
			meta="Draft saved"
			primaryAction={<Button>Approve</Button>}
			secondaryAction={<Button variant="secondary">Back</Button>}
			{...props}
		/>,
	);
}

function countMatches(source: string, pattern: RegExp): number {
	return source.match(pattern)?.length ?? 0;
}
