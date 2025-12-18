import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GlobalLLMInput } from "../GlobalLLMInput";

const parseContextualUpdate = vi.fn();
const applyContextualUpdate = vi.fn();

vi.mock("@/contexts/RaContext", () => ({
  useRaContext: () => ({
    saving: false,
    actions: {
      parseContextualUpdate,
      applyContextualUpdate
    }
  })
}));

describe("GlobalLLMInput clarification loop", () => {
  it("re-parses with a follow-up answer when clarification is required", async () => {
    const user = userEvent.setup();

    parseContextualUpdate
      .mockResolvedValueOnce({
        commands: [],
        summary: "Need more info",
        needsClarification: true,
        clarificationPrompt: "Which step are you referring to?"
      })
      .mockResolvedValueOnce({
        commands: [
          {
            intent: "modify",
            target: "step",
            location: { stepIndex: 1 },
            data: { note: "Add ladder" },
            explanation: "Add ladder to step 2"
          }
        ],
        summary: "1 update(s)",
        needsClarification: false
      });

    render(<GlobalLLMInput currentPhase={"PROCESS_STEPS" as any} />);

    await user.type(screen.getByPlaceholderText(/Describe changes in natural language/i), "Add a ladder");
    await user.click(screen.getByRole("button", { name: "Parse" }));

    expect(await screen.findByText("Which step are you referring to?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply All" })).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Answer the question to clarify/i), "Step 2");
    await user.click(screen.getByRole("button", { name: "Re-parse" }));

    expect(await screen.findByText("Add ladder to step 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply All" })).toBeInTheDocument();

    expect(parseContextualUpdate).toHaveBeenCalledTimes(2);
    expect(parseContextualUpdate.mock.calls[1]?.[0]).toMatch(/Clarification:\s*Step 2/);
  });
});

