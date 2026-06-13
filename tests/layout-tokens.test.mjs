import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const layoutSource = readFileSync("src/app/layout.tsx", "utf8");
const globalsCss = readFileSync("src/app/globals.css", "utf8");

const cssForDom = globalsCss.replace(/^@(import|config)[^;]+;\s*/gm, "");

function resolveCssVar(value, style) {
  const match = value.trim().match(/^var\((--[\w-]+)\)$/);
  return match ? style.getPropertyValue(match[1]).trim() : value.trim();
}

test("root layout renders dark mode by default", () => {
  assert.match(layoutSource, /<html[^>]*className="dark"[^>]*>/);
});

test("body background resolves to the dark background token", () => {
  const dom = new JSDOM(
    `<!doctype html><html class="dark"><head><style>${cssForDom}</style></head><body></body></html>`,
  );

  const { document } = dom.window;
  const htmlStyle = dom.window.getComputedStyle(document.documentElement);
  const bodyStyle = dom.window.getComputedStyle(document.body);

  const darkBackground = htmlStyle.getPropertyValue("--color-bg").trim();
  assert.equal(darkBackground, "#0e0e10");
  assert.equal(
    resolveCssVar(bodyStyle.getPropertyValue("background-color"), htmlStyle),
    darkBackground,
  );
});
