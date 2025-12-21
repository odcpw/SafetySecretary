import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { TenantServiceFactory } from "./tenantServiceFactory";
import {
  ActionSuggestion,
  ControlSuggestion,
  LlmService,
  SuggestActionsParams,
  SuggestControlsParams
} from "./llmService";

export type LlmJobStatus = "queued" | "running" | "completed" | "failed";
export type LlmJobType =
  | "steps"
  | "hazards"
  | "controls"
  | "actions"
  | "jha-rows"
  | "incident-narrative"
  | "incident-witness"
  | "incident-merge"
  | "incident-consistency";

interface BaseJobInput {
  caseId: string;
  tenantDbUrl: string;
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

interface JhaRowsJobInput extends BaseJobInput {
  jobDescription: string;
}

interface IncidentWitnessJobInput extends BaseJobInput {
  accountId: string;
  statement: string;
}

interface IncidentNarrativeJobInput extends BaseJobInput {
  narrative: string;
}

interface IncidentMergeJobInput extends BaseJobInput {}

interface IncidentConsistencyJobInput extends BaseJobInput {}

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

  constructor(
    private readonly tenantServiceFactory: TenantServiceFactory,
    private readonly llmService: LlmService
  ) {}

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

  enqueueJhaRowExtraction(payload: JhaRowsJobInput): PublicLlmJob {
    const job = this.createJob<JhaRowsJobInput>({ type: "jha-rows", input: payload });
    this.enqueue(job);
    return this.toPublicJob(job);
  }

  enqueueIncidentNarrativeExtraction(payload: IncidentNarrativeJobInput): PublicLlmJob {
    const job = this.createJob<IncidentNarrativeJobInput>({ type: "incident-narrative", input: payload });
    this.enqueue(job);
    return this.toPublicJob(job);
  }

  enqueueIncidentWitnessExtraction(payload: IncidentWitnessJobInput): PublicLlmJob {
    const job = this.createJob<IncidentWitnessJobInput>({ type: "incident-witness", input: payload });
    this.enqueue(job);
    return this.toPublicJob(job);
  }

  enqueueIncidentTimelineMerge(payload: IncidentMergeJobInput): PublicLlmJob {
    const job = this.createJob<IncidentMergeJobInput>({ type: "incident-merge", input: payload });
    this.enqueue(job);
    return this.toPublicJob(job);
  }

  enqueueIncidentConsistencyCheck(payload: IncidentConsistencyJobInput): PublicLlmJob {
    const job = this.createJob<IncidentConsistencyJobInput>({ type: "incident-consistency", input: payload });
    this.enqueue(job);
    return this.toPublicJob(job);
  }

  getJob(jobId: string, tenantDbUrl: string): PublicLlmJob | null {
    const job = this.jobs.get(jobId);
    if (!job || job.input?.tenantDbUrl !== tenantDbUrl) {
      return null;
    }
    return this.toPublicJob(job);
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
        case "jha-rows":
          await this.handleJhaRowsJob(job as LlmJob<JhaRowsJobInput>);
          break;
        case "incident-narrative":
          await this.handleIncidentNarrativeJob(job as LlmJob<IncidentNarrativeJobInput>);
          break;
        case "incident-witness":
          await this.handleIncidentWitnessJob(job as LlmJob<IncidentWitnessJobInput>);
          break;
        case "incident-merge":
          await this.handleIncidentMergeJob(job as LlmJob<IncidentMergeJobInput>);
          break;
        case "incident-consistency":
          await this.handleIncidentConsistencyJob(job as LlmJob<IncidentConsistencyJobInput>);
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
    const { raService } = this.tenantServiceFactory.getServices(job.input.tenantDbUrl);
    const extraction = await this.llmService.extractStepsFromDescription(job.input.description);
    const updated = await raService.setStepsFromExtraction(job.input.caseId, extraction.steps);
    job.result = {
      stepsGenerated: extraction.steps.length,
      totalSteps: updated.steps.length
    };
  }

  private async handleHazardsJob(job: LlmJob<HazardsJobInput>) {
    const { raService } = this.tenantServiceFactory.getServices(job.input.tenantDbUrl);
    const raCase = await raService.getCaseById(job.input.caseId);
    if (!raCase) {
      throw new Error("Case not found");
    }
    const extraction = await this.llmService.extractHazardsFromNarrative({
      narrative: job.input.narrative,
      steps: raCase.steps
    });
    await raService.mergeExtractedHazards(job.input.caseId, extraction.hazards);
    job.result = {
      hazardsGenerated: extraction.hazards.length
    };
  }

  private async handleControlsJob(job: LlmJob<ControlsJobInput>) {
    const { raService } = this.tenantServiceFactory.getServices(job.input.tenantDbUrl);
    const raCase = await raService.getCaseById(job.input.caseId);
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
    await raService.mergeSuggestedControls(job.input.caseId, result.suggestions);
    job.result = {
      controlsEnhanced: result.suggestions.length
    };
  }

  private async handleActionsJob(job: LlmJob<ActionsJobInput>) {
    const { raService } = this.tenantServiceFactory.getServices(job.input.tenantDbUrl);
    const raCase = await raService.getCaseById(job.input.caseId);
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
    const created = await raService.createSuggestedActions(job.input.caseId, result.actions);
    job.result = {
      actionsCreated: created
    };
  }

  private async handleJhaRowsJob(job: LlmJob<JhaRowsJobInput>) {
    const { jhaService } = this.tenantServiceFactory.getServices(job.input.tenantDbUrl);
    const jhaCase = await jhaService.getCaseById(job.input.caseId);
    if (!jhaCase) {
      throw new Error("JHA case not found");
    }
    const extraction = await this.llmService.extractJhaRows(job.input.jobDescription);
    await jhaService.replaceRowsFromExtraction(job.input.caseId, extraction.rows);
    job.result = {
      rowsGenerated: extraction.rows.length
    };
  }

  private async handleIncidentNarrativeJob(job: LlmJob<IncidentNarrativeJobInput>) {
    const { incidentService } = this.tenantServiceFactory.getServices(job.input.tenantDbUrl);
    const extraction = await this.llmService.extractIncidentNarrative(job.input.narrative);
    const draft = {
      facts: extraction.facts,
      timeline: extraction.timeline,
      clarifications: extraction.clarifications
    } as unknown as Prisma.InputJsonValue;
    const updated = await incidentService.updateAssistantDraft(job.input.caseId, {
      narrative: job.input.narrative,
      draft
    });
    if (!updated) {
      throw new Error("Incident case not found");
    }

    job.result = {
      factsExtracted: extraction.facts.length,
      eventsExtracted: extraction.timeline.length,
      clarifications: extraction.clarifications
    };
  }

  private async handleIncidentWitnessJob(job: LlmJob<IncidentWitnessJobInput>) {
    const { incidentService } = this.tenantServiceFactory.getServices(job.input.tenantDbUrl);
    const extraction = await this.llmService.extractIncidentWitness(job.input.statement);
    const facts = extraction.facts.map((fact, index) => ({
      accountId: job.input.accountId,
      orderIndex: index,
      text: fact.text
    }));
    const events = extraction.personalTimeline.map((event, index) => ({
      accountId: job.input.accountId,
      orderIndex: index,
      timeLabel: event.timeLabel ?? null,
      text: event.text
    }));

    await incidentService.replaceAccountFacts(job.input.caseId, job.input.accountId, facts);
    await incidentService.replaceAccountPersonalEvents(job.input.caseId, job.input.accountId, events);

    job.result = {
      factsExtracted: facts.length,
      eventsExtracted: events.length,
      openQuestions: extraction.openQuestions
    };
  }

  private async handleIncidentMergeJob(job: LlmJob<IncidentMergeJobInput>) {
    const { incidentService } = this.tenantServiceFactory.getServices(job.input.tenantDbUrl);
    const incidentCase = await incidentService.getCaseById(job.input.caseId);
    if (!incidentCase) {
      throw new Error("Incident case not found");
    }

    const accounts = incidentCase.accounts.map((account) => ({
      accountId: account.id,
      role: account.person?.role ?? null,
      name: account.person?.name ?? null,
      facts: account.facts.map((fact) => ({ text: fact.text })),
      personalTimeline: account.personalEvents.map((event) => ({
        timeLabel: event.timeLabel ?? null,
        text: event.text
      }))
    }));

    const merge = await this.llmService.mergeIncidentTimeline(accounts);
    type TimelineSourceInput = { accountId: string; factId?: string | null; personalEventId?: string | null };
    const rows = merge.timeline.map((row) => {
      const sources = row.sources
        .map((source): TimelineSourceInput | null => {
          const account = incidentCase.accounts.find((item) => item.id === source.accountId);
          if (!account) return null;
          const factId =
            Number.isInteger(source.factIndex) && source.factIndex !== undefined
              ? account.facts[source.factIndex]?.id ?? null
              : null;
          const personalEventId =
            Number.isInteger(source.personalEventIndex) && source.personalEventIndex !== undefined
              ? account.personalEvents[source.personalEventIndex]?.id ?? null
              : null;
          if (!factId && !personalEventId) return null;
          return { accountId: account.id, factId, personalEventId };
        })
        .filter((item): item is TimelineSourceInput => item !== null);

      return {
        timeLabel: row.timeLabel ?? null,
        text: row.text,
        confidence: row.confidence,
        sources
      };
    });

    await incidentService.replaceTimelineFromMerge(job.input.caseId, rows);

    job.result = {
      eventsGenerated: merge.timeline.length,
      openQuestions: merge.openQuestions
    };
  }

  private async handleIncidentConsistencyJob(job: LlmJob<IncidentConsistencyJobInput>) {
    const { incidentService } = this.tenantServiceFactory.getServices(job.input.tenantDbUrl);
    const incidentCase = await incidentService.getCaseById(job.input.caseId);
    if (!incidentCase) {
      throw new Error("Incident case not found");
    }
    const timeline = incidentCase.timelineEvents.map((event) => ({
      timeLabel: event.timeLabel ?? null,
      text: event.text
    }));
    const result = await this.llmService.checkIncidentConsistency(timeline);
    job.result = { issues: result.issues };
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
