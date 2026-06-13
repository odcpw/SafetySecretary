import assert from "node:assert/strict";
import test from "node:test";
import type React from "react";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import Input from "../../../src/components/ui/Input";
import { TextInputFixtures } from "../../../src/components/ui/__fixtures__/text-inputs";

type JsdomWindow = Window & typeof globalThis;
type Jsdom = {
  window: JsdomWindow;
};
type JsdomConstructor = new (html?: string) => Jsdom;

const { JSDOM } = require("jsdom") as { JSDOM: JsdomConstructor };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function installDom(window: JsdomWindow) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: window,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: window.document,
  });
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: window.HTMLElement,
  });
  Object.defineProperty(globalThis, "HTMLInputElement", {
    configurable: true,
    value: window.HTMLInputElement,
  });
  Object.defineProperty(globalThis, "Node", {
    configurable: true,
    value: window.Node,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: window.navigator,
  });
}

function render(ui: React.ReactNode) {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id=\"root\"></div></body></html>",
  );
  installDom(dom.window);

  const container = document.getElementById("root");
  assert.ok(container);

  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });

  return {
    cleanup: () => {
      act(() => {
        root.unmount();
      });
    },
    container,
  };
}

test("Input associates its visible label with the underlying input", () => {
  const { cleanup, container } = render(
    <Input id="activity" label="Activity name" placeholder="Activity name" />,
  );

  try {
    const label = container.querySelector("label");
    const input = container.querySelector<HTMLInputElement>("input");

    assert.equal(label?.getAttribute("for"), "activity");
    assert.equal(input?.id, "activity");
    assert.equal(input?.getAttribute("placeholder"), "Activity name");
  } finally {
    cleanup();
  }
});

test("Input appends error text to an existing helper description", () => {
  const { cleanup, container } = render(
    <>
      <p id="activity-helper">Use the HIRA activity name.</p>
      <Input
        aria-describedby="activity-helper"
        error="Activity name is required."
        id="activity-error-field"
        label="Activity name"
      />
    </>,
  );

  try {
    const input = container.querySelector<HTMLInputElement>("input");
    const alert = container.querySelector('[role="alert"]');

    assert.equal(input?.getAttribute("aria-invalid"), "true");
    assert.equal(
      input?.getAttribute("aria-describedby"),
      "activity-helper activity-error-field-error",
    );
    assert.equal(
      input?.getAttribute("aria-errormessage"),
      "activity-error-field-error",
    );
    assert.equal(alert?.id, "activity-error-field-error");
    assert.equal(alert?.textContent, "Activity name is required.");
  } finally {
    cleanup();
  }
});

test("Input exposes disabled and readonly state through DOM and ARIA", () => {
  const { cleanup, container } = render(
    <>
      <Input disabled id="disabled-input" label="Disabled input" />
      <Input id="readonly-input" label="Read-only input" readOnly />
    </>,
  );

  try {
    const disabledInput =
      container.querySelector<HTMLInputElement>("#disabled-input");
    const readonlyInput =
      container.querySelector<HTMLInputElement>("#readonly-input");

    assert.equal(disabledInput?.disabled, true);
    assert.equal(disabledInput?.getAttribute("aria-disabled"), "true");
    assert.equal(readonlyInput?.readOnly, true);
    assert.equal(readonlyInput?.getAttribute("aria-readonly"), "true");
  } finally {
    cleanup();
  }
});

test("Input forwards its ref to the underlying input element", () => {
  const ref = createRef<HTMLInputElement>();
  const { cleanup } = render(<Input label="Ref input" ref={ref} />);

  try {
    assert.ok(ref.current instanceof HTMLInputElement);
  } finally {
    cleanup();
  }
});

test("Input fixture renders every required state", () => {
  const { cleanup, container } = render(<TextInputFixtures />);

  try {
    assert.ok(container.querySelector<HTMLInputElement>("#input-default"));
    assert.equal(
      container.querySelector<HTMLInputElement>("#input-disabled")?.disabled,
      true,
    );
    assert.equal(
      container.querySelector<HTMLInputElement>("#input-readonly")?.readOnly,
      true,
    );
    assert.equal(
      container
        .querySelector<HTMLInputElement>("#input-error")
        ?.getAttribute("aria-invalid"),
      "true",
    );
    assert.equal(
      container
        .querySelector<HTMLInputElement>("#input-required")
        ?.getAttribute("aria-describedby"),
      "input-required-helper",
    );
    assert.equal(
      container.querySelector<HTMLInputElement>("#input-required")?.required,
      true,
    );
  } finally {
    cleanup();
  }
});
