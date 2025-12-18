import { describe, expect, it, vi } from "vitest";
import { LlmService } from "../src/services/llmService";

describe("LlmService.parseContextualUpdate", () => {
  it("returns empty commands when needsClarification is true", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: "Need clarification",
              needsClarification: true,
              clarificationPrompt: "Which step?",
              commands: [
                {
                  intent: "modify",
                  target: "step",
                  location: { stepIndex: 0 },
                  data: { equipment: ["Ladder"] },
                  explanation: "Add ladder"
                }
              ]
            })
          }
        }
      ]
    });

    const client: any = {
      chat: {
        completions: {
          create
        }
      }
    };

    const service = new LlmService(client);
    const result = await service.parseContextualUpdate({
      userInput: "Add a ladder",
      currentPhase: "PROCESS_STEPS",
      tableState: {
        steps: [{ id: "step-1", activity: "Work", equipment: [], substances: [] }],
        hazards: [],
        actions: []
      }
    });

    expect(result.needsClarification).toBe(true);
    expect(result.clarificationPrompt).toBe("Which step?");
    expect(result.commands).toEqual([]);

    expect(create).toHaveBeenCalledTimes(1);
    const request = create.mock.calls[0]?.[0];
    expect(request.temperature).toBe(0);
    expect(request.response_format).toEqual({ type: "json_object" });
  });
});

