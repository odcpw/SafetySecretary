import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { JhaLanding } from "../JhaLanding";
import { I18nProvider } from "@/i18n/I18nContext";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ cases: [] })
  });
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

vi.mock("@/components/common/ThemeToggle", () => ({
  ThemeToggle: () => null
}));

vi.mock("@/components/common/UserMenu", () => ({
  UserMenu: () => null
}));

describe("JhaLanding", () => {
  it("renders the JHA landing copy", () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <JhaLanding />
        </MemoryRouter>
      </I18nProvider>
    );

    expect(screen.getByText(/Job hazard analysis/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create JHA/i })).toBeInTheDocument();
  });
});
