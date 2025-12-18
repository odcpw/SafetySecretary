import { afterEach, describe, expect, it, vi } from "vitest";
import { pollJobUntilDone } from "../jobs";

describe("pollJobUntilDone", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps unknown job types to 'unknown' while preserving rawType", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "job-1",
        type: "new-backend-type",
        status: "completed",
        result: { ok: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    });

    vi.stubGlobal("fetch", fetchMock as any);

    const job = await pollJobUntilDone("job-1", { intervalMs: 1, timeoutMs: 50 });

    expect(job.type).toBe("unknown");
    expect(job.rawType).toBe("new-backend-type");
  });

  it("keeps known job types unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "job-2",
        type: "controls",
        status: "completed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    });

    vi.stubGlobal("fetch", fetchMock as any);

    const job = await pollJobUntilDone("job-2", { intervalMs: 1, timeoutMs: 50 });

    expect(job.type).toBe("controls");
    expect(job.rawType).toBe("controls");
  });
});

