import { randomUUID } from "crypto";
import { RiskAssessmentService } from "./raService";
import {
  ActionSuggestion,
  ControlSuggestion,
  LlmService,
  SuggestActionsParams,
  SuggestControlsParams
} from "./llmService";

export type LlmJobStatus = "queued" | "running" | "completed" | "failed";
export type LlmJobType = "steps" | "hazards" | "controls" | "actions";

interface BaseJobInput {
  caseId: string;
}

interface StepsJobInput extends BaseJobInput {
  description: string;
}

interface HazardsJobInput extends BaseJobInput {
  narrative: string;
}

interface ControlsJobInput extends BaseJobInput {
  notes: string;
}

interface ActionsJobInput extends BaseJobInput {
  notes: string;
}

interface LlmJob<TInput, TResult = unknown> {
  id: string;
  type: LlmJobType;
  status: LlmJobStatus;
  input: TInput;
  result?: TResult;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicLlmJob {
  id: string;
  type: LlmJobType;
  status: LlmJobStatus;
  error?: string;
  result?: unknown;
  createdAt: string;
  updatedAt: string;
}

export class LlmJobManager {
  private readonly jobs = new Map<string, LlmJob<any>>();
  private readonly queue: LlmJob<any>[] = [];
  private isProcessing = false;

  constructor(private readonly raService: RiskAssessmentService, private readonly llmService: LlmService) {}

  enqueueStepsExtraction(payload: StepsJobInput): PublicLlmJob {
    const job = this.createJob<StepsJobInput>({ type: "steps", input: payload });
    this.enqueue(job);
    return this.toPublicJob(job);
  }

  enqueueHazardExtraction(payload: HazardsJobInput): PublicLlmJob {
    const job = this.createJob<HazardsJobInput>({ type: "hazards", input: payload });
    this.enqueue(job);
    return this.toPublicJob(job);
  }

  enqueueControlExtraction(payload: ControlsJobInput): PublicLlmJob {
    const job = this.createJob<ControlsJobInput>({ type: "controls", input: payload });
    this.enqueue(job);
    return this.toPublicJob(job);
  }

  enqueueActionExtraction(payload: ActionsJobInput): PublicLlmJob {
    const job = this.createJob<ActionsJobInput>({ type: "actions", input: payload });
    this.enqueue(job);
    return this.toPublicJob(job);
  }

  getJob(jobId: string): PublicLlmJob | null {
    const job = this.jobs.get(jobId);
    return job ? this.toPublicJob(job) : null;
  }

  private createJob<TInput>({ type, input }: { type: LlmJobType; input: TInput }): LlmJob<TInput> {
    const now = new Date();
    const job: LlmJob<TInput> = {
      id: randomUUID(),
      type,
      status: "queued",
      input,
      createdAt: now,
      updatedAt: now
    };
    this.jobs.set(job.id, job);
    return job;
  }

  private enqueue(job: LlmJob<any>) {
    this.queue.push(job);
    void this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    const job = this.queue.shift();
    if (!job) {
      return;
    }

    this.isProcessing = true;
    job.status = "running";
    job.updatedAt = new Date();

    try {
      switch (job.type) {
        case "steps":
          await this.handleStepsJob(job as LlmJob<StepsJobInput>);
          break;
        case "hazards":
          await this.handleHazardsJob(job as LlmJob<HazardsJobInput>);
          break;
        case "controls":
          await this.handleControlsJob(job as LlmJob<ControlsJobInput>);
          break;
        case "actions":
          await this.handleActionsJob(job as LlmJob<ActionsJobInput>);
          break;
        default:
          throw new Error(`Unsupported job type: ${String(job.type)}`);
      }
      job.status = "completed";
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Unknown error";
    } finally {
      job.updatedAt = new Date();
      this.isProcessing = false;
      if (this.queue.length > 0) {
        void this.processQueue();
      }
    }
  }

  private async handleStepsJob(job: LlmJob<StepsJobInput>) {
    const extraction = await this.llmService.extractStepsFromDescription(job.input.description);
    const updated = await this.raService.setStepsFromExtraction(job.input.caseId, extraction.steps);
    job.result = {
      stepsGenerated: extraction.steps.length,
      totalSteps: updated.steps.length
    };
  }

  private async handleHazardsJob(job: LlmJob<HazardsJobInput>) {
    const raCase = await this.raService.getCaseById(job.input.caseId);
    if (!raCase) {
      throw new Error("Case not found");
    }
    const extraction = await this.llmService.extractHazardsFromNarrative({
      narrative: job.input.narrative,
      steps: raCase.steps
    });
    await this.raService.mergeExtractedHazards(job.input.caseId, extraction.hazards);
    job.result = {
      hazardsGenerated: extraction.hazards.length
    };
  }

  private async handleControlsJob(job: LlmJob<ControlsJobInput>) {
    const raCase = await this.raService.getCaseById(job.input.caseId);
    if (!raCase) {
      throw new Error("Case not found");
    }
    const payload: SuggestControlsParams = {
      notes: job.input.notes,
      hazards: raCase.hazards.map((hazard) => {
        const item: SuggestControlsParams["hazards"][number] = {
          id: hazard.id,
          label: hazard.label,
          description: hazard.description,
          categoryCode: hazard.categoryCode
        };
        // Existing controls are now stored directly on hazard
        if (hazard.existingControls && hazard.existingControls.length > 0) {
          item.existingControls = hazard.existingControls;
        }
        if (hazard.baseline) {
          item.baseline = hazard.baseline;
        }
        if (hazard.residual) {
          item.residual = hazard.residual;
        }
        return item;
      })
    };
    const result = await this.llmService.suggestControlsFromNotes(payload);
    await this.raService.mergeSuggestedControls(job.input.caseId, result.suggestions);
    job.result = {
      controlsEnhanced: result.suggestions.length
    };
  }

  private async handleActionsJob(job: LlmJob<ActionsJobInput>) {
    const raCase = await this.raService.getCaseById(job.input.caseId);
    if (!raCase) {
      throw new Error("Case not found");
    }
    const payload: SuggestActionsParams = {
      notes: job.input.notes,
      hazards: raCase.hazards.map((hazard) => ({
        id: hazard.id,
        label: hazard.label,
        description: hazard.description
      }))
    };
    const result = await this.llmService.suggestActionsFromNotes(payload);
    const created = await this.raService.createSuggestedActions(job.input.caseId, result.actions);
    job.result = {
      actionsCreated: created
    };
  }

  private toPublicJob(job: LlmJob<any>): PublicLlmJob {
    const payload: PublicLlmJob = {
      id: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString()
    };
    if (typeof job.error === "string") {
      payload.error = job.error;
    }
    if (typeof job.result !== "undefined") {
      payload.result = job.result;
    }
    return payload;
  }
}
