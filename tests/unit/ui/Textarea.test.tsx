import assert from "node:assert/strict";
import test from "node:test";
import type React from "react";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import Textarea from "../../../src/components/ui/Textarea";
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
  Object.defineProperty(globalThis, "HTMLTextAreaElement", {
    configurable: true,
    value: window.HTMLTextAreaElement,
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

test("Textarea associates its visible label with the underlying textarea", () => {
  const { cleanup, container } = render(
    <Textarea
      id="hazard"
      label="Hazard description"
      placeholder="Describe the hazard"
      rows={4}
    />,
  );

  try {
    const label = container.querySelector("label");
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");

    assert.equal(label?.getAttribute("for"), "hazard");
    assert.equal(textarea?.id, "hazard");
    assert.equal(textarea?.getAttribute("placeholder"), "Describe the hazard");
    assert.equal(textarea?.getAttribute("rows"), "4");
  } finally {
    cleanup();
  }
});

test("Textarea appends error text to an existing helper description", () => {
  const { cleanup, container } = render(
    <>
      <p id="hazard-helper">Include the hazard source.</p>
      <Textarea
        aria-describedby="hazard-helper"
        error="Hazard description is required."
        id="hazard-error-field"
        label="Hazard description"
      />
    </>,
  );

  try {
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    const alert = container.querySelector('[role="alert"]');

    assert.equal(textarea?.getAttribute("aria-invalid"), "true");
    assert.equal(
      textarea?.getAttribute("aria-describedby"),
      "hazard-helper hazard-error-field-error",
    );
    assert.equal(
      textarea?.getAttribute("aria-errormessage"),
      "hazard-error-field-error",
    );
    assert.equal(alert?.id, "hazard-error-field-error");
    assert.equal(alert?.textContent, "Hazard description is required.");
  } finally {
    cleanup();
  }
});

test("Textarea exposes disabled and readonly state through DOM and ARIA", () => {
  const { cleanup, container } = render(
    <>
      <Textarea disabled id="disabled-textarea" label="Disabled textarea" />
      <Textarea id="readonly-textarea" label="Read-only textarea" readOnly />
    </>,
  );

  try {
    const disabledTextarea =
      container.querySelector<HTMLTextAreaElement>("#disabled-textarea");
    const readonlyTextarea =
      container.querySelector<HTMLTextAreaElement>("#readonly-textarea");

    assert.equal(disabledTextarea?.disabled, true);
    assert.equal(disabledTextarea?.getAttribute("aria-disabled"), "true");
    assert.equal(readonlyTextarea?.readOnly, true);
    assert.equal(readonlyTextarea?.getAttribute("aria-readonly"), "true");
  } finally {
    cleanup();
  }
});

test("Textarea forwards its ref to the underlying textarea element", () => {
  const ref = createRef<HTMLTextAreaElement>();
  const { cleanup } = render(<Textarea label="Ref textarea" ref={ref} />);

  try {
    assert.ok(ref.current instanceof HTMLTextAreaElement);
  } finally {
    cleanup();
  }
});

test("Textarea fixture renders every required state", () => {
  const { cleanup, container } = render(<TextInputFixtures />);

  try {
    assert.ok(
      container.querySelector<HTMLTextAreaElement>("#textarea-default"),
    );
    assert.equal(
      container.querySelector<HTMLTextAreaElement>("#textarea-disabled")
        ?.disabled,
      true,
    );
    assert.equal(
      container.querySelector<HTMLTextAreaElement>("#textarea-readonly")
        ?.readOnly,
      true,
    );
    assert.equal(
      container
        .querySelector<HTMLTextAreaElement>("#textarea-error")
        ?.getAttribute("aria-invalid"),
      "true",
    );
    assert.equal(
      container
        .querySelector<HTMLTextAreaElement>("#textarea-required")
        ?.getAttribute("aria-describedby"),
      "textarea-required-helper",
    );
    assert.equal(
      container.querySelector<HTMLTextAreaElement>("#textarea-required")
        ?.required,
      true,
    );
  } finally {
    cleanup();
  }
});
