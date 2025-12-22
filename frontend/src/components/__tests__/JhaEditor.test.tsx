import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { JhaEditor } from "../JhaEditor";
import { I18nProvider } from "@/i18n/I18nContext";

const mockActions = {
  refreshCase: vi.fn(),
  updateCaseMeta: vi.fn(),
  saveSteps: vi.fn(),
  saveHazards: vi.fn(),
  extractRows: vi.fn(),
  assistSteps: vi.fn(),
  assistHazards: vi.fn(),
  suggestControls: vi.fn(),
  applyStepCommands: vi.fn(),
  applyHazardCommands: vi.fn()
};

const baseCase = {
  id: "jha-1",
  createdAt: "2025-03-01",
  updatedAt: "2025-03-01",
  jobTitle: "Mobile plant & site traffic",
  site: "North yard",
  supervisor: "Shift supervisor",
  workersInvolved: "Operator, spotter",
  jobDate: null,
  revision: "1.0",
  preparedBy: "Name",
  reviewedBy: "Name",
  approvedBy: "Name",
  signoffDate: null,
  workflowStage: "steps",
  steps: [{ id: "step-1", orderIndex: 0, label: "Arrival" }],
  hazards: [
    {
      id: "hazard-1",
      stepId: "step-1",
      orderIndex: 0,
      hazard: "Site traffic conflict",
      consequence: "Crushing",
      controls: ["Traffic plan", "Banksman"]
    }
  ],
  attachments: []
};

const createCase = (overrides: Partial<typeof baseCase> = {}) => ({
  ...baseCase,
  ...overrides,
  steps: overrides.steps ? [...overrides.steps] : baseCase.steps.map((step) => ({ ...step })),
  hazards: overrides.hazards ? [...overrides.hazards] : baseCase.hazards.map((hazard) => ({ ...hazard }))
});

let mockCase = createCase();

const apiFetchMock = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args)
}));

vi.mock("@/contexts/JhaContext", () => ({
  useJhaContext: () => ({
    jhaCase: mockCase,
    loading: false,
    saving: false,
    actions: mockActions
  })
}));

vi.mock("@/hooks/useJhaAttachments", () => ({
  useJhaAttachments: () => ({
    attachments: [],
    loading: false,
    error: null,
    uploadToStep: vi.fn(),
    uploadToHazard: vi.fn(),
    moveToStep: vi.fn(),
    moveToHazard: vi.fn(),
    reorderStepAttachments: vi.fn(),
    deleteAttachment: vi.fn()
  })
}));

vi.mock("@/components/common/UserMenu", () => ({
  UserMenu: () => null
}));

const mockApiResponse = (payload: unknown) => ({
  ok: true,
  json: async () => payload,
  text: async () => JSON.stringify(payload)
});

beforeEach(() => {
  mockCase = createCase();
  Object.values(mockActions).forEach((fn) => fn.mockReset());
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (input: RequestInfo) => {
    const url = String(input);
    if (url.includes("/steps")) {
      return mockApiResponse({ steps: mockCase.steps });
    }
    if (url.includes("/hazards")) {
      return mockApiResponse({ hazards: mockCase.hazards });
    }
    return mockApiResponse({});
  });
});

describe("JhaEditor", () => {
  it("renders the JHA editor shell", () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <JhaEditor />
        </MemoryRouter>
      </I18nProvider>
    );

    expect(screen.getByText("Job hazard analysis")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export PDF/i })).toBeInTheDocument();
  });

  it("moves to hazards stage when steps are complete", () => {
    mockCase = createCase({ workflowStage: "steps" });
    render(
      <I18nProvider>
        <MemoryRouter>
          <JhaEditor />
        </MemoryRouter>
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Hazards" }));
    expect(screen.getByRole("heading", { name: "Hazards" })).toBeInTheDocument();
  });

  it("blocks hazards stage when steps are incomplete", () => {
    mockCase = createCase({
      workflowStage: "steps",
      steps: [{ id: "step-1", orderIndex: 0, label: "" }],
      hazards: []
    });
    render(
      <I18nProvider>
        <MemoryRouter>
          <JhaEditor />
        </MemoryRouter>
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Hazards" }));
    expect(screen.getByText("Add and label at least one step before moving on.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Job steps" })).toBeInTheDocument();
  });

  it("saves steps and refreshes the case", async () => {
    mockCase = createCase({ workflowStage: "steps" });
    render(
      <I18nProvider>
        <MemoryRouter>
          <JhaEditor />
        </MemoryRouter>
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Save steps" }));
    await waitFor(() => expect(mockActions.refreshCase).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining("/steps"), expect.any(Object));
  });

  it("saves hazards and refreshes the case", async () => {
    mockCase = createCase({ workflowStage: "hazards" });
    render(
      <I18nProvider>
        <MemoryRouter>
          <JhaEditor />
        </MemoryRouter>
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Save hazards" }));
    await waitFor(() => expect(mockActions.refreshCase).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining("/hazards"), expect.any(Object));
  });

  it("saves controls and refreshes the case", async () => {
    mockCase = createCase({ workflowStage: "controls" });
    render(
      <I18nProvider>
        <MemoryRouter>
          <JhaEditor />
        </MemoryRouter>
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Save controls" }));
    await waitFor(() => expect(mockActions.refreshCase).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining("/hazards"), expect.any(Object));
  });
});
