import { z } from "zod";

export type LlmJobStatus = "queued" | "running" | "completed" | "failed";
export type LlmJobType = "steps" | "hazards" | "controls" | "actions";
export type LlmJobTypeOrUnknown = LlmJobType | "unknown";

const LlmJobStatusSchema = z.enum(["queued", "running", "completed", "failed"]);
const LlmJobResponseSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: LlmJobStatusSchema,
  result: z.unknown().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const KNOWN_JOB_TYPES = new Set<LlmJobType>(["steps", "hazards", "controls", "actions"]);

export interface LlmJobResponse {
  id: string;
  type: LlmJobTypeOrUnknown;
  rawType: string;
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

    const parsed = LlmJobResponseSchema.parse(await response.json());
    const rawType = parsed.type;
    const type: LlmJobTypeOrUnknown = KNOWN_JOB_TYPES.has(rawType as LlmJobType)
      ? (rawType as LlmJobType)
      : "unknown";
    const payload: LlmJobResponse = {
      ...parsed,
      type,
      rawType
    };

    if (payload.status === "completed" || payload.status === "failed") {
      return payload;
    }

    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for extraction job");
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
};
