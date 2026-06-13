import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (context.parentURL && specifier.startsWith(".")) {
			const candidates = [
				new URL(`${specifier}.ts`, context.parentURL),
				new URL(`${specifier}.tsx`, context.parentURL),
				new URL(`${specifier}/index.ts`, context.parentURL),
			];
			const resolved = candidates.find((candidate) => existsSync(candidate));

			if (resolved) {
				return {
					shortCircuit: true,
					url: resolved.href,
				};
			}
		}

		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (!url.startsWith("file:") || !/\.[cm]?tsx?$/.test(url)) {
			return nextLoad(url, context);
		}

		const source = readFileSync(fileURLToPath(url), "utf8");
		const transpiled = ts.transpileModule(source, {
			compilerOptions: {
				jsx: ts.JsxEmit.ReactJSX,
				module: ts.ModuleKind.ESNext,
				moduleResolution: ts.ModuleResolutionKind.Bundler,
				target: ts.ScriptTarget.ES2022,
			},
			fileName: fileURLToPath(url),
		});

		return {
			format: "module",
			shortCircuit: true,
			source: transpiled.outputText,
		};
	},
});

const componentModulePath =
	"../../../src/components/agent/StructuredOperationReview.tsx";
const fixtureModulePath =
	"../../../src/components/agent/__fixtures__/structured-operation-review.tsx";
const agentModulePath = "../../../src/lib/agent/index.ts";
const requireFromTest = createRequire(import.meta.url);

const { default: StructuredOperationReview } = (await import(
	componentModulePath
)) as typeof import("../../../src/components/agent/StructuredOperationReview");
const {
	StructuredOperationReviewFixture,
	structuredOperationReviewFixtureOperations,
} = (await import(
	fixtureModulePath
)) as typeof import("../../../src/components/agent/__fixtures__/structured-operation-review");
const { AgentConfirmationMode } = (await import(
	agentModulePath
)) as typeof import("../../../src/lib/agent");
type StructuredOperationReviewProps = Parameters<
	typeof StructuredOperationReview
>[0];

test("fixture renders every confirmation mode with source and run identity", () => {
	const html = renderToStaticMarkup(
		createElement(StructuredOperationReviewFixture),
	);

	assert.match(html, /aria-label="Structured operation review fixture"/);
	assert.match(html, /Question for the user/);
	assert.match(html, /Timeline event: Cable left across the printer walkway/);
	assert.match(html, /Fill empty slot/);
	assert.match(html, /S-T-O-P action: T/);
	assert.match(html, /Similar HIRA suggestion/);
	assert.match(html, /Traceability/);
	assert.match(html, /incident-investigation@0.1.0:cause-analysis/);
	assert.match(html, /run-fixture-001/);
	assert.match(html, /Situation before/);
	assert.match(html, /Nothing changes until a user chooses an action/);
});

test("ask-only operations cannot be applied but can be revised or ignored", async () => {
	const decisions: string[] = [];
	const { container, root } = await renderReview(
		structuredOperationReviewFixtureOperations.askOnly,
		(decision) => {
			decisions.push(decision);
		},
	);

	assert.equal(findButton(container, "Apply"), null);
	assert.equal(findButton(container, "Fill"), null);
	assert.equal(findButton(container, "Edit then apply"), null);
	assert.equal(decisions.length, 0);

	await clickButton(container, "Ask for revision");
	await clickButton(container, "Ignore");

	assert.deepEqual(decisions, ["ask-revise", "ignore"]);
	await unmount(root);
});

test("proposal operations do not apply on render and apply only after click", async () => {
	const decisions: string[] = [];
	const { container, root } = await renderReview(
		structuredOperationReviewFixtureOperations.propose,
		(decision) => {
			decisions.push(decision);
		},
	);

	assert.equal(decisions.length, 0);

	await clickButton(container, "Apply");

	assert.deepEqual(decisions, ["apply"]);
	await unmount(root);
});

test("fill mode is traceable when the user opted into an empty target", async () => {
	const decisions: Array<{ decision: string; mode: string }> = [];
	const { container, root } = await renderReview(
		structuredOperationReviewFixtureOperations.fillAllowed,
		(decision, input) => {
			decisions.push({ decision, mode: input.effectiveMode });
		},
		{
			fillState: {
				optedIn: true,
				targetEmpty: true,
				targetLabel: "department",
			},
		},
	);
	const review = getReview(container);

	assert.equal(review.getAttribute("data-confirmation-mode"), "fill");
	assert.equal(review.getAttribute("data-effective-mode"), "fill");
	assert.match(container.textContent ?? "", /Fill is traceable/);
	assert.match(container.textContent ?? "", /department/);

	await clickButton(container, "Fill");

	assert.deepEqual(decisions, [
		{ decision: "apply", mode: AgentConfirmationMode.Fill },
	]);
	await unmount(root);
});

test("fill mode downgrades to proposal when target is not empty", async () => {
	const decisions: Array<{ decision: string; mode: string }> = [];
	const { container, root } = await renderReview(
		structuredOperationReviewFixtureOperations.fillDowngraded,
		(decision, input) => {
			decisions.push({ decision, mode: input.effectiveMode });
		},
		{
			fillState: {
				optedIn: true,
				targetEmpty: false,
				targetLabel: "task / activity",
			},
		},
	);
	const review = getReview(container);

	assert.equal(review.getAttribute("data-confirmation-mode"), "fill");
	assert.equal(review.getAttribute("data-effective-mode"), "propose");
	assert.match(container.textContent ?? "", /shown as a proposal/);
	assert.equal(findButton(container, "Fill"), null);

	await clickButton(container, "Apply");

	assert.deepEqual(decisions, [
		{ decision: "apply", mode: AgentConfirmationMode.Propose },
	]);
	await unmount(root);
});

test("edit-then-apply passes the user-edited text", async () => {
	const edits: string[] = [];
	const { container, dom, root } = await renderReview(
		structuredOperationReviewFixtureOperations.edit,
		(decision, input) => {
			if (decision === "edit-then-apply" && input.editedText) {
				edits.push(input.editedText);
			}
		},
	);
	const textarea = container.querySelector("textarea");
	assert.ok(textarea, "edit mode should render an editor");

	await act(async () => {
		setNativeTextareaValue(textarea, "Install a temporary cable bridge today.");
		textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	});
	await clickButton(container, "Edit then apply");

	assert.deepEqual(edits, ["Install a temporary cable bridge today."]);
	await unmount(root);
});

test("primary apply edit action passes the user-edited text", async () => {
	const edits: string[] = [];
	const { container, dom, root } = await renderReview(
		structuredOperationReviewFixtureOperations.edit,
		(decision, input) => {
			if (decision === "apply" && input.editedText) {
				edits.push(input.editedText);
			}
		},
	);
	const textarea = container.querySelector("textarea");
	assert.ok(textarea, "edit mode should render an editor");

	await act(async () => {
		setNativeTextareaValue(textarea, "Install a fixed cable route.");
		textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	});
	await clickButton(container, "Apply edit");

	assert.deepEqual(edits, ["Install a fixed cable route."]);
	await unmount(root);
});

test("editor text resets when a reused component receives a new operation", async () => {
	const { container, root } = await renderReview(
		structuredOperationReviewFixtureOperations.edit,
	);

	assert.equal(
		container.querySelector("textarea")?.value,
		"Route temporary cables away from normal walking paths",
	);

	await act(async () => {
		root.render(
			createElement(StructuredOperationReview, {
				operation: structuredOperationReviewFixtureOperations.propose,
			}),
		);
	});

	assert.equal(
		container.querySelector("textarea")?.value,
		"A loose cable was lying across the walking route to the label printer before the person arrived.",
	);
	await unmount(root);
});

test("generic HIRA operation kinds render domain content, not a placeholder", () => {
	const html = renderToStaticMarkup(
		createElement(StructuredOperationReview, {
			operation: structuredOperationReviewFixtureOperations.hira,
		}),
	);

	assert.match(html, /Similar HIRA suggestion/);
	assert.match(html, /HIRA-2026-004/);
	assert.match(html, /cable bridge/);
	assert.doesNotMatch(html, /Review this assistant suggestion/);
});

async function renderReview(
	operation: StructuredOperationReviewProps["operation"],
	onDecision?: StructuredOperationReviewProps["onDecision"],
	options?: Pick<StructuredOperationReviewProps, "fillState">,
): Promise<{
	container: HTMLDivElement;
	dom: TestDom;
	root: Root;
}> {
	const dom = setupDom();
	const container = dom.window.document.createElement("div");
	dom.window.document.body.append(container);
	const { createRoot } = requireFromTest(
		"react-dom/client",
	) as typeof import("react-dom/client");
	const root = createRoot(container);

	await act(async () => {
		root.render(
			createElement(StructuredOperationReview, {
				fillState: options?.fillState,
				onDecision,
				operation,
			}),
		);
	});

	return { container, dom, root };
}

function setupDom(): TestDom {
	const dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "https://app.example.test",
	});
	const globals = globalThis as unknown as Record<string, unknown>;
	globals.IS_REACT_ACT_ENVIRONMENT = true;
	globals.window = dom.window;
	globals.document = dom.window.document;
	globals.HTMLElement = dom.window.HTMLElement;
	globals.Event = dom.window.Event;
	globals.HTMLButtonElement = dom.window.HTMLButtonElement;
	globals.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
	globals.Node = dom.window.Node;
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: dom.window.navigator,
	});
	return dom;
}

const { JSDOM } = requireFromTest("jsdom") as {
	JSDOM: new (html: string, options: { url: string }) => TestDom;
};

function getReview(container: HTMLElement): HTMLElement {
	const review = container.querySelector<HTMLElement>(
		"[data-operation-review]",
	);
	assert.ok(review, "operation review should render");
	return review;
}

function findButton(
	container: HTMLElement,
	label: string,
): HTMLButtonElement | null {
	return (
		[...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === label,
		) ?? null
	);
}

async function clickButton(
	container: HTMLElement,
	label: string,
): Promise<void> {
	const button = findButton(container, label);
	assert.ok(button, `button "${label}" should render`);

	await act(async () => {
		button.click();
	});
}

function setNativeTextareaValue(
	textarea: HTMLTextAreaElement,
	value: string,
): void {
	const setter = Object.getOwnPropertyDescriptor(
		HTMLTextAreaElement.prototype,
		"value",
	)?.set;
	assert.ok(setter, "textarea value setter should exist");
	setter.call(textarea, value);
}

async function unmount(root: Root): Promise<void> {
	await act(async () => {
		root.unmount();
	});
}

type TestDom = {
	window: Window & typeof globalThis;
};
