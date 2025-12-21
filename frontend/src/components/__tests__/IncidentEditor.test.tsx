import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IncidentEditor } from "../IncidentEditor";
import type { IncidentCase } from "@/types/incident";
import { I18nProvider } from "@/i18n/I18nContext";

const mockActions = {
  addPerson: vi.fn(),
  updatePerson: vi.fn(),
  addAccount: vi.fn(),
  updateAccount: vi.fn(),
  extractAccount: vi.fn(),
  extractNarrative: vi.fn(),
  updateAssistantDraft: vi.fn(),
  applyAssistantDraft: vi.fn(),
  mergeTimeline: vi.fn(),
  checkConsistency: vi.fn(),
  saveTimeline: vi.fn(),
  saveDeviations: vi.fn(),
  saveCauses: vi.fn(),
  saveActions: vi.fn(),
  updateCaseMeta: vi.fn(),
  refreshCase: vi.fn()
};

const baseCase: IncidentCase = {
  id: "incident-1",
  createdAt: "2025-03-01",
  updatedAt: "2025-03-01",
  title: "Forklift near miss",
  incidentAt: null,
  incidentTimeNote: "",
  location: "Warehouse",
  incidentType: "NEAR_MISS",
  coordinatorRole: "Supervisor",
  coordinatorName: null,
  assistantNarrative: null,
  assistantDraft: null,
  assistantDraftUpdatedAt: null,
  persons: [],
  accounts: [],
  timelineEvents: [],
  deviations: [],
  attachments: []
};

const createCase = (overrides: Partial<IncidentCase> = {}) => ({
  ...baseCase,
  ...overrides,
  persons: overrides.persons ? [...overrides.persons] : [],
  accounts: overrides.accounts ? [...overrides.accounts] : [],
  timelineEvents: overrides.timelineEvents ? [...overrides.timelineEvents] : [],
  deviations: overrides.deviations ? [...overrides.deviations] : [],
  attachments: overrides.attachments ? [...overrides.attachments] : []
});

let mockCase = createCase();

vi.mock("@/contexts/IncidentContext", () => ({
  useIncidentContext: () => ({
    incidentCase: mockCase,
    loading: false,
    saving: false,
    actions: mockActions
  })
}));

vi.mock("@/hooks/useIncidentAttachments", () => ({
  useIncidentAttachments: () => ({
    attachments: [],
    loading: false,
    error: null,
    uploadToTimeline: vi.fn(),
    moveToTimeline: vi.fn(),
    reorderTimelineAttachments: vi.fn(),
    deleteAttachment: vi.fn()
  })
}));

beforeEach(() => {
  mockCase = createCase();
  Object.values(mockActions).forEach((fn) => fn.mockReset());
});

describe("IncidentEditor", () => {
  it("renders incident editor shell", () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <IncidentEditor />
        </MemoryRouter>
      </I18nProvider>
    );

    expect(screen.getByText("Incident investigation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export PDF/i })).toBeInTheDocument();
  });

  it("renders the assistant panel", () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <IncidentEditor />
        </MemoryRouter>
      </I18nProvider>
    );

    expect(screen.getByRole("heading", { name: "Incident assistant" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Extract draft" })).toBeInTheDocument();
  });

  it("submits narrative extraction", async () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <IncidentEditor />
        </MemoryRouter>
      </I18nProvider>
    );

    const input = screen.getByPlaceholderText(
      "Describe what happened, who was involved, and what you observed..."
    );
    fireEvent.change(input, { target: { value: "A spill occurred near the dock." } });
    fireEvent.click(screen.getByRole("button", { name: "Extract draft" }));

    await waitFor(() => {
      expect(mockActions.extractNarrative).toHaveBeenCalledWith("A spill occurred near the dock.");
    });
  });

  it("saves assistant draft updates", async () => {
    mockCase = createCase({
      assistantNarrative: "Initial narrative",
      assistantDraft: {
        facts: [{ text: "Fact" }],
        timeline: [],
        clarifications: []
      }
    });
    render(
      <I18nProvider>
        <MemoryRouter>
          <IncidentEditor />
        </MemoryRouter>
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(mockActions.updateAssistantDraft).toHaveBeenCalled());
  });

  it("applies assistant timeline", async () => {
    mockCase = createCase({
      assistantDraft: {
        facts: [],
        timeline: [
          {
            timeLabel: "09:00",
            text: "Spill reported",
            confidence: "CONFIRMED"
          }
        ],
        clarifications: []
      }
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <I18nProvider>
        <MemoryRouter>
          <IncidentEditor />
        </MemoryRouter>
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply to timeline" }));
    await waitFor(() =>
      expect(mockActions.applyAssistantDraft).toHaveBeenCalledWith([
        { timeLabel: "09:00", text: "Spill reported", confidence: "CONFIRMED" }
      ])
    );
    confirmSpy.mockRestore();
  });
});
