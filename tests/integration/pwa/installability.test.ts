import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.PWA_BASE_URL ?? "http://127.0.0.1:3000";

type Manifest = {
  name?: unknown;
  short_name?: unknown;
  start_url?: unknown;
  display?: unknown;
  theme_color?: unknown;
  icons?: unknown;
  serviceworker?: unknown;
};

function absoluteUrl(path: string): string {
  return new URL(path, baseUrl).toString();
}

async function fetchText(path: string): Promise<string> {
  const response = await fetch(absoluteUrl(path));
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  return response.text();
}

function findTag(html: string, tagName: string, requiredAttrs: Record<string, string>): string {
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  const tags = html.match(tagPattern) ?? [];

  const tag = tags.find((candidate) => {
    const attrs = parseAttributes(candidate);
    return Object.entries(requiredAttrs).every(
      ([name, value]) => attrs.get(name.toLowerCase()) === value,
    );
  });

  assert.ok(
    tag,
    `Missing <${tagName}> with ${Object.entries(requiredAttrs)
      .map(([name, value]) => `${name}="${value}"`)
      .join(" ")}`,
  );
  return tag;
}

function parseAttributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const attrPattern = /([a-zA-Z:-]+)\s*=\s*["']([^"']*)["']/g;

  for (const match of tag.matchAll(attrPattern)) {
    attrs.set(match[1].toLowerCase(), match[2]);
  }

  return attrs;
}

async function fetchManifest(): Promise<Manifest> {
  const raw = await fetchText("/manifest.webmanifest");
  return JSON.parse(raw) as Manifest;
}

test("rendered HTML exposes the web app manifest link", async () => {
  const html = await fetchText("/");

  findTag(html, "link", {
    rel: "manifest",
    href: "/manifest.webmanifest",
  });
});

test("rendered theme-color meta matches manifest theme_color", async () => {
  const [html, manifest] = await Promise.all([fetchText("/"), fetchManifest()]);

  assert.equal(manifest.theme_color, "#0e0e10");

  const themeMeta = findTag(html, "meta", {
    name: "theme-color",
  });
  const attrs = parseAttributes(themeMeta);

  assert.equal(attrs.get("content"), manifest.theme_color);
});

test("served manifest has Chromium installability basics without offline scope", async () => {
  const manifest = await fetchManifest();

  assert.equal(manifest.name, "Safety Secretary");
  assert.equal(manifest.short_name, "SafetySec");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#0e0e10");
  assert.equal(manifest.serviceworker, undefined);

  assert.ok(Array.isArray(manifest.icons), "manifest.icons must be an array");

  const icons = manifest.icons as Array<{ src?: unknown; sizes?: unknown; type?: unknown }>;
  for (const size of [192, 512]) {
    assert.ok(
      icons.some(
        (icon) =>
          icon.src === `/icons/icon-${size}.png` &&
          icon.sizes === `${size}x${size}` &&
          icon.type === "image/png",
      ),
      `Missing installability icon ${size}x${size}`,
    );
  }
});
