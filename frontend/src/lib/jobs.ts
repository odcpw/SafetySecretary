export type LlmJobStatus = "queued" | "running" | "completed" | "failed";

export interface LlmJobResponse {
  id: string;
  type: "steps" | "hazards";
  status: LlmJobStatus;
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export const pollJobUntilDone = async (
  jobId: string,
  options: PollOptions = {}
): Promise<LlmJobResponse> => {
  const interval = options.intervalMs ?? 1500;
  const timeout = options.timeoutMs ?? 60_000;
  const start = Date.now();

  while (true) {
    const response = await fetch(`/api/llm-jobs/${jobId}`);
    if (!response.ok) {
      throw new Error(`Unable to load job ${jobId}`);
    }
    const payload = (await response.json()) as LlmJobResponse;
    if (payload.status === "completed" || payload.status === "failed") {
      return payload;
    }

    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for extraction job");
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
};
