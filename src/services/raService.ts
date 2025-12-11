import {
  ControlHierarchy,
  HazardAssessmentType,
  Prisma,
  RiskAssessmentPhase as PrismaPhase
} from "@prisma/client";
import prisma from "./prismaClient";
import {
  ActionInput,
  CreateRiskAssessmentInput,
  HazardAssessmentSnapshot,
  HazardInput,
  HazardRatingInput,
  LikelihoodLevel,
  ProcessStepInput,
  ProposedControlInput,
  ResidualRiskInput,
  RiskAssessmentPhase,
  SeverityLevel
} from "../types/riskAssessment";
import { ActionSuggestion, ControlSuggestion, ExtractedHazard } from "./llmService";

// Phase order for HIRA workflow
const phaseOrder: RiskAssessmentPhase[] = [
  RiskAssessmentPhase.PROCESS_STEPS,
  RiskAssessmentPhase.HAZARD_IDENTIFICATION,
  RiskAssessmentPhase.RISK_RATING,
  RiskAssessmentPhase.CONTROL_DISCUSSION,
  RiskAssessmentPhase.ACTIONS,
  RiskAssessmentPhase.RESIDUAL_RISK,
  RiskAssessmentPhase.COMPLETE
];

const caseInclude = {
  steps: {
    orderBy: {
      orderIndex: "asc" as const
    }
  },
  hazards: {
    include: {
      steps: true,
      assessments: true,
      proposedControls: true
    },
    orderBy: {
      createdAt: "asc" as const
    }
  },
  actions: {
    orderBy: {
      createdAt: "asc" as const
    }
  }
} satisfies Prisma.RiskAssessmentCaseInclude;

type CaseWithRelations = Prisma.RiskAssessmentCaseGetPayload<{
  include: typeof caseInclude;
}>;

// DTO for hazard with all relations mapped
export type HazardDto = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  caseId: string;
  label: string;
  description: string | null;
  categoryCode: string | null;
  existingControls: string[];
  stepIds: string[];
  stepOrder: Record<string, number>;
  baselineAssessment?: HazardAssessmentSnapshot;
  residualAssessment?: HazardAssessmentSnapshot;
  baseline?: HazardAssessmentSnapshot;
  residual?: HazardAssessmentSnapshot;
  proposedControls: { id: string; description: string; hierarchy: string | null }[];
};

export type RiskAssessmentCaseDto = Omit<CaseWithRelations, "hazards"> & {
  hazards: HazardDto[];
};

export interface RiskAssessmentCaseSummary {
  id: string;
  activityName: string;
  location: string | null;
  team: string | null;
  phase: RiskAssessmentPhase;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export class RiskAssessmentService {
  constructor(private readonly db = prisma) {}

  private async attachHazardToStep(
    tx: Prisma.TransactionClient,
    hazardId: string,
    stepId: string
  ): Promise<void> {
    const orderIndex = await tx.hazardStep.count({ where: { stepId } });
    await tx.hazardStep.create({
      data: { hazardId, stepId, orderIndex }
    });
  }

  private async normalizeStepHazardOrder(tx: Prisma.TransactionClient, stepId: string): Promise<void> {
    const items = await tx.hazardStep.findMany({
      where: { stepId },
      orderBy: { orderIndex: "asc" }
    });
    await Promise.all(
      items.map((item, index) =>
        tx.hazardStep.update({
          where: { hazardId_stepId: { hazardId: item.hazardId, stepId } },
          data: { orderIndex: index }
        })
      )
    );
  }

  async listCases(params?: { createdBy?: string | null; limit?: number }): Promise<RiskAssessmentCaseSummary[]> {
    const limit = params?.limit && Number.isFinite(params.limit) ? Math.max(1, Math.min(100, params.limit)) : 20;
    const filters: Prisma.RiskAssessmentCaseWhereInput = {};
    if (params?.createdBy) {
      filters.createdBy = params.createdBy;
    }

    const cases = await this.db.riskAssessmentCase.findMany({
      where: filters,
      orderBy: { createdAt: "desc" },
      take: limit
    });

    return cases.map((item) => ({
      id: item.id,
      activityName: item.activityName,
      location: item.location,
      team: item.team,
      phase: item.phase as RiskAssessmentPhase,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      createdBy: item.createdBy ?? null
    }));
  }

  async createCase(input: CreateRiskAssessmentInput): Promise<RiskAssessmentCaseDto> {
    const created = await this.db.riskAssessmentCase.create({
      data: {
        activityName: input.activityName,
        location: input.location ?? null,
        team: input.team ?? null,
        createdBy: input.createdBy ?? null,
        phase: PrismaPhase.PROCESS_STEPS
      },
      include: caseInclude
    });

    return this.mapCase(created);
  }

  async getCaseById(id: string): Promise<RiskAssessmentCaseDto | null> {
    const raCase = await this.db.riskAssessmentCase.findUnique({
      where: { id },
      include: caseInclude
    });

    return raCase ? this.mapCase(raCase) : null;
  }

  async updateCaseMeta(
    id: string,
    patch: Partial<CreateRiskAssessmentInput & { phase: RiskAssessmentPhase }>
  ): Promise<RiskAssessmentCaseDto | null> {
    const allowed: Prisma.RiskAssessmentCaseUpdateInput = {};

    if (typeof patch.activityName === "string") {
      allowed.activityName = patch.activityName;
    }
    if (typeof patch.location === "string" || patch.location === null) {
      allowed.location = patch.location ?? null;
    }
    if (typeof patch.team === "string" || patch.team === null) {
      allowed.team = patch.team ?? null;
    }
    if (patch.phase && phaseOrder.includes(patch.phase)) {
      allowed.phase = patch.phase as PrismaPhase;
    }

    if (Object.keys(allowed).length === 0) {
      return this.getCaseById(id);
    }

    const updated = await this.db.riskAssessmentCase.update({
      where: { id },
      data: allowed,
      include: caseInclude
    });

    return this.mapCase(updated);
  }

  async advancePhase(id: string): Promise<RiskAssessmentCaseDto | null> {
    const existing = await this.db.riskAssessmentCase.findUnique({ where: { id } });
    if (!existing) {
      return null;
    }

    const currentPhase = (existing.phase as string) as RiskAssessmentPhase;
    const index = phaseOrder.indexOf(currentPhase);
    const nextPhase = index === -1 || index === phaseOrder.length - 1 ? currentPhase : phaseOrder[index + 1];

    const updated = await this.db.riskAssessmentCase.update({
      where: { id },
      data: { phase: nextPhase as PrismaPhase },
      include: caseInclude
    });

    return this.mapCase(updated);
  }

  async deleteCase(id: string): Promise<boolean> {
    try {
      await this.db.riskAssessmentCase.delete({ where: { id } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return false;
      }
      throw error;
    }
  }

  async setStepsFromExtraction(id: string, steps: ProcessStepInput[]): Promise<RiskAssessmentCaseDto> {
    const updated = await this.updateSteps(id, steps);
    if (!updated) {
      throw new Error(`Case ${id} not found while setting steps`);
    }
    return updated;
  }

  // Update process steps with HIRA triad (activity, equipment, substances)
  async updateSteps(id: string, steps: ProcessStepInput[]): Promise<RiskAssessmentCaseDto | null> {
    const raCase = await this.db.riskAssessmentCase.findUnique({ where: { id } });
    if (!raCase) {
      return null;
    }

    await this.db.$transaction(async (tx) => {
      const existingSteps = await tx.processStep.findMany({
        where: { caseId: id }
      });
      const seen = new Set<string>();

      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index]!;
        const payload = {
          activity: step.activity,
          equipment: step.equipment ?? [],
          substances: step.substances ?? [],
          description: step.description ?? null,
          orderIndex: step.orderIndex ?? index
        };

        if (step.id) {
          seen.add(step.id);
          await tx.processStep.update({
            where: { id: step.id },
            data: payload
          });
        } else {
          const created = await tx.processStep.create({
            data: {
              caseId: id,
              ...payload
            }
          });
          seen.add(created.id);
        }
      }

      const obsolete = existingSteps.filter((step) => !seen.has(step.id)).map((step) => step.id);
      if (obsolete.length) {
        await tx.hazardStep.deleteMany({
          where: {
            stepId: {
              in: obsolete
            }
          }
        });

        await tx.processStep.deleteMany({
          where: {
            id: {
              in: obsolete
            }
          }
        });
      }
    });

    return this.getCaseById(id);
  }

  // Merge extracted hazards with category and existing controls
  async mergeExtractedHazards(id: string, hazards: ExtractedHazard[]): Promise<RiskAssessmentCaseDto | null> {
    const raCase = await this.db.riskAssessmentCase.findUnique({ where: { id } });
    if (!raCase) {
      return null;
    }

    await this.db.$transaction(async (tx) => {
      for (const hazard of hazards) {
        const created = await tx.hazard.create({
          data: {
            caseId: id,
            label: hazard.label,
            description: hazard.description ?? null,
            categoryCode: hazard.categoryCode ?? null,
            existingControls: hazard.existingControls ?? []
          }
        });

        if (hazard.stepIds && hazard.stepIds.length) {
          for (const stepId of hazard.stepIds) {
            await this.attachHazardToStep(tx, created.id, stepId);
          }
        }
      }
    });

    return this.getCaseById(id);
  }

  // Add a manual hazard with category and existing controls
  async addManualHazard(
    id: string,
    hazard: HazardInput & { stepId: string }
  ): Promise<HazardDto | null> {
    const step = await this.db.processStep.findFirst({
      where: { id: hazard.stepId, caseId: id }
    });
    if (!step) {
      return null;
    }

    const withSteps = await this.db.$transaction(async (tx) => {
      const created = await tx.hazard.create({
        data: {
          caseId: id,
          label: hazard.label,
          description: hazard.description ?? null,
          categoryCode: hazard.categoryCode ?? null,
          existingControls: hazard.existingControls ?? []
        }
      });

      await this.attachHazardToStep(tx, created.id, hazard.stepId);

      return tx.hazard.findUnique({
        where: { id: created.id },
        include: { steps: true, assessments: true, proposedControls: true }
      });
    });

    return withSteps ? this.mapHazard(withSteps) : null;
  }

  // Update hazard with category and existing controls
  async updateHazard(
    caseId: string,
    hazardId: string,
    patch: {
      label?: string;
      description?: string | null;
      categoryCode?: string | null;
      existingControls?: string[];
      stepIds?: string[]
    }
  ): Promise<HazardDto | null> {
    const hazard = await this.db.hazard.findFirst({
      where: { id: hazardId, caseId }
    });
    if (!hazard) {
      return null;
    }

    const existingLinks = await this.db.hazardStep.findMany({ where: { hazardId } });

    await this.db.$transaction(async (tx) => {
      const payload: Prisma.HazardUpdateInput = {};
      if (typeof patch.label === "string") {
        payload.label = patch.label;
      }
      if (typeof patch.description === "string" || patch.description === null) {
        payload.description = patch.description ?? null;
      }
      if (typeof patch.categoryCode === "string" || patch.categoryCode === null) {
        payload.categoryCode = patch.categoryCode ?? null;
      }
      if (Array.isArray(patch.existingControls)) {
        payload.existingControls = patch.existingControls;
      }

      if (Object.keys(payload).length) {
        await tx.hazard.update({
          where: { id: hazardId },
          data: payload
        });
      }

      if (patch.stepIds) {
        await tx.hazardStep.deleteMany({ where: { hazardId } });
        await Promise.all(
          existingLinks.map((link) => this.normalizeStepHazardOrder(tx, link.stepId))
        );
        for (const stepId of patch.stepIds) {
          await this.attachHazardToStep(tx, hazardId, stepId);
        }
      }
    });

    const updated = await this.db.hazard.findUnique({
      where: { id: hazardId },
      include: { steps: true, assessments: true, proposedControls: true }
    });

    return updated ? this.mapHazard(updated) : null;
  }

  async setHazardRiskRatings(
    caseId: string,
    ratings: HazardRatingInput[]
  ): Promise<RiskAssessmentCaseDto | null> {
    const hazardIds = ratings.map((r) => r.hazardId);
    const hazards = await this.db.hazard.findMany({
      where: { caseId, id: { in: hazardIds } }
    });
    if (hazards.length === 0) {
      return null;
    }

    await this.db.$transaction(async (tx) => {
      for (const rating of ratings) {
        await tx.hazardAssessment.upsert({
          where: {
            hazardId_type: {
              hazardId: rating.hazardId,
              type: HazardAssessmentType.BASELINE
            }
          },
          update: {
            severity: rating.severity,
            likelihood: rating.likelihood,
            riskRating: `${rating.severity}_${rating.likelihood}`
          },
          create: {
            hazardId: rating.hazardId,
            type: HazardAssessmentType.BASELINE,
            severity: rating.severity,
            likelihood: rating.likelihood,
            riskRating: `${rating.severity}_${rating.likelihood}`
          }
        });
      }
    });

    return this.getCaseById(caseId);
  }

  // Add proposed controls (from control discussion phase)
  async addProposedControl(
    caseId: string,
    input: ProposedControlInput
  ): Promise<RiskAssessmentCaseDto | null> {
    const hazard = await this.db.hazard.findFirst({
      where: { id: input.hazardId, caseId }
    });
    if (!hazard) {
      return null;
    }

    await this.db.hazardControl.create({
      data: {
        hazardId: input.hazardId,
        description: input.description,
        hierarchy: input.hierarchy as ControlHierarchy | null
      }
    });

    return this.getCaseById(caseId);
  }

  // Add multiple proposed controls
  async addProposedControls(
    caseId: string,
    inputs: ProposedControlInput[]
  ): Promise<RiskAssessmentCaseDto | null> {
    if (!inputs.length) {
      return this.getCaseById(caseId);
    }

    const hazardIds = [...new Set(inputs.map((i) => i.hazardId))];
    const hazards = await this.db.hazard.findMany({
      where: { caseId, id: { in: hazardIds } }
    });
    if (hazards.length === 0) {
      return null;
    }

    const validHazardIds = new Set(hazards.map((h) => h.id));
    const validInputs = inputs.filter((i) => validHazardIds.has(i.hazardId));

    await this.db.hazardControl.createMany({
      data: validInputs.map((input) => ({
        hazardId: input.hazardId,
        description: input.description,
        hierarchy: input.hierarchy as ControlHierarchy | null
      }))
    });

    return this.getCaseById(caseId);
  }

  // Delete a proposed control
  async deleteProposedControl(caseId: string, controlId: string): Promise<boolean> {
    const control = await this.db.hazardControl.findFirst({
      where: { id: controlId },
      include: { hazard: true }
    });
    if (!control || control.hazard.caseId !== caseId) {
      return false;
    }

    await this.db.hazardControl.delete({ where: { id: controlId } });
    return true;
  }

  async setResidualRiskRatings(
    caseId: string,
    ratings: ResidualRiskInput[]
  ): Promise<RiskAssessmentCaseDto | null> {
    if (!ratings.length) {
      return this.getCaseById(caseId);
    }

    const hazardIds = ratings.map((r) => r.hazardId);
    const hazards = await this.db.hazard.findMany({
      where: { caseId, id: { in: hazardIds } }
    });
    if (hazards.length === 0) {
      return null;
    }

    await this.db.$transaction(async (tx) => {
      for (const rating of ratings) {
        await tx.hazardAssessment.upsert({
          where: {
            hazardId_type: {
              hazardId: rating.hazardId,
              type: HazardAssessmentType.RESIDUAL
            }
          },
          update: {
            severity: rating.severity,
            likelihood: rating.likelihood,
            riskRating: `${rating.severity}_${rating.likelihood}`
          },
          create: {
            hazardId: rating.hazardId,
            type: HazardAssessmentType.RESIDUAL,
            severity: rating.severity,
            likelihood: rating.likelihood,
            riskRating: `${rating.severity}_${rating.likelihood}`
          }
        });
      }
    });

    return this.getCaseById(caseId);
  }

  // Merge LLM-suggested controls into proposed controls
  async mergeSuggestedControls(caseId: string, suggestions: ControlSuggestion[]): Promise<void> {
    if (!suggestions.length) {
      return;
    }
    const raCase = await this.getCaseById(caseId);
    if (!raCase) {
      throw new Error("Case not found");
    }

    const controlInputs: ProposedControlInput[] = [];
    const residualPayload: ResidualRiskInput[] = [];
    const hazardMap = new Map(raCase.hazards.map((hazard) => [hazard.id, hazard]));

    for (const suggestion of suggestions) {
      const hazard = hazardMap.get(suggestion.hazardId);
      if (!hazard) {
        continue;
      }
      // Add suggested controls as proposed controls
      if (suggestion.controls?.length) {
        for (const control of suggestion.controls) {
          controlInputs.push({
            hazardId: hazard.id,
            description: control,
            hierarchy: suggestion.hierarchy ?? null
          });
        }
      }
      if (suggestion.residualSeverity && suggestion.residualLikelihood) {
        residualPayload.push({
          hazardId: hazard.id,
          severity: suggestion.residualSeverity,
          likelihood: suggestion.residualLikelihood
        });
      }
    }

    if (controlInputs.length) {
      await this.addProposedControls(caseId, controlInputs);
    }
    if (residualPayload.length) {
      await this.setResidualRiskRatings(caseId, residualPayload);
    }
  }

  async createSuggestedActions(caseId: string, suggestions: ActionSuggestion[]): Promise<number> {
    if (!suggestions.length) {
      return 0;
    }
    let created = 0;
    for (const suggestion of suggestions) {
      if (!suggestion.description?.trim()) {
        continue;
      }
      const payload: ActionInput = {
        hazardId: suggestion.hazardId,
        description: suggestion.description.trim()
      };
      const owner = suggestion.owner?.trim();
      if (owner) {
        payload.owner = owner;
      }
      if (typeof suggestion.dueInDays === "number" && Number.isFinite(suggestion.dueInDays)) {
        payload.dueDate = new Date(Date.now() + suggestion.dueInDays * 24 * 60 * 60 * 1000).toISOString();
      }
      const action = await this.addAction(caseId, payload);
      if (action) {
        created += 1;
      }
    }
    return created;
  }

  async deleteHazard(caseId: string, hazardId: string): Promise<boolean> {
    const hazard = await this.db.hazard.findFirst({
      where: { id: hazardId, caseId }
    });
    if (!hazard) {
      return false;
    }
    const stepLinks = await this.db.hazardStep.findMany({ where: { hazardId } });
    await this.db.$transaction(async (tx) => {
      await tx.hazard.delete({ where: { id: hazardId } });
      await Promise.all(
        stepLinks.map((link) => this.normalizeStepHazardOrder(tx, link.stepId))
      );
    });
    return true;
  }

  async reorderHazardsForStep(caseId: string, stepId: string, hazardIds: string[]): Promise<boolean> {
    const step = await this.db.processStep.findFirst({
      where: { id: stepId, caseId }
    });
    if (!step) {
      return false;
    }
    const existing = await this.db.hazardStep.findMany({
      where: { stepId },
      select: { hazardId: true }
    });
    const existingSet = new Set(existing.map((item) => item.hazardId));
    const filtered = hazardIds.filter((id) => existingSet.has(id));
    const remainder = existing.map((item) => item.hazardId).filter((id) => !filtered.includes(id));
    const finalOrder = [...filtered, ...remainder];
    await this.db.$transaction(async (tx) => {
      await Promise.all(
        finalOrder.map((hazardId, index) =>
          tx.hazardStep.update({
            where: { hazardId_stepId: { hazardId, stepId } },
            data: { orderIndex: index }
          })
        )
      );
    });
    return true;
  }

  async addAction(caseId: string, input: ActionInput): Promise<CaseWithRelations["actions"][number] | null> {
    const hazard = await this.db.hazard.findFirst({
      where: { id: input.hazardId, caseId }
    });

    if (!hazard) {
      return null;
    }

    const action = await this.db.correctiveAction.create({
      data: {
        caseId,
        hazardId: input.hazardId,
        description: input.description,
        owner: input.owner ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null
      }
    });

    return action;
  }

  async updateAction(
    caseId: string,
    actionId: string,
    patch: { description?: string; owner?: string | null; dueDate?: string | null; status?: string }
  ): Promise<CaseWithRelations["actions"][number] | null> {
    const action = await this.db.correctiveAction.findFirst({
      where: { id: actionId, caseId }
    });
    if (!action) {
      return null;
    }

    const payload: Prisma.CorrectiveActionUpdateInput = {};
    if (typeof patch.description === "string") {
      payload.description = patch.description;
    }
    if (typeof patch.owner === "string" || patch.owner === null) {
      payload.owner = patch.owner ?? null;
    }
    if (typeof patch.dueDate === "string" || patch.dueDate === null) {
      payload.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;
    }
    if (patch.status) {
      payload.status = patch.status as any;
    }

    const updated = await this.db.correctiveAction.update({
      where: { id: actionId },
      data: payload
    });

    return updated;
  }

  async deleteAction(caseId: string, actionId: string): Promise<boolean> {
    const action = await this.db.correctiveAction.findFirst({
      where: { id: actionId, caseId }
    });
    if (!action) {
      return false;
    }
    await this.db.correctiveAction.delete({ where: { id: actionId } });
    return true;
  }

  private mapCase(record: CaseWithRelations): RiskAssessmentCaseDto {
    const stepOrder = new Map<string, number>();
    record.steps.forEach((step, index) => stepOrder.set(step.id, index));

    const sortKey = (hazard: CaseWithRelations["hazards"][number]) => {
      const orders = hazard.steps
        .map((step) => stepOrder.get(step.stepId))
        .filter((value): value is number => typeof value === "number");
      if (orders.length === 0) {
        return Number.MAX_SAFE_INTEGER;
      }
      return Math.min(...orders);
    };

    const hazards = [...record.hazards].sort((a, b) => {
      const diff = sortKey(a) - sortKey(b);
      return diff !== 0 ? diff : a.createdAt.getTime() - b.createdAt.getTime();
    });

    return {
      ...record,
      hazards: hazards.map((hazard) => this.mapHazard(hazard))
    };
  }

  private mapHazard(hazard: CaseWithRelations["hazards"][number]): HazardDto {
    const { steps, assessments, proposedControls, ...rest } = hazard;
    const baseline = assessments.find((assessment) => assessment.type === HazardAssessmentType.BASELINE);
    const residual = assessments.find((assessment) => assessment.type === HazardAssessmentType.RESIDUAL);

    const dto: HazardDto = {
      id: rest.id,
      createdAt: rest.createdAt,
      updatedAt: rest.updatedAt,
      caseId: rest.caseId,
      label: rest.label,
      description: rest.description,
      categoryCode: rest.categoryCode,
      existingControls: rest.existingControls,
      stepIds: steps.map((step) => step.stepId),
      stepOrder: steps.reduce<Record<string, number>>((acc, step) => {
        acc[step.stepId] = step.orderIndex ?? 0;
        return acc;
      }, {}),
      proposedControls: proposedControls.map((control) => ({
        id: control.id,
        description: control.description,
        hierarchy: control.hierarchy
      }))
    };

    if (baseline) {
      const baselineDto: HazardAssessmentSnapshot = {
        severity: baseline.severity as SeverityLevel,
        likelihood: baseline.likelihood as LikelihoodLevel,
        riskRating: baseline.riskRating
      };
      dto.baselineAssessment = baselineDto;
      dto.baseline = baselineDto;
    }

    if (residual) {
      const residualDto: HazardAssessmentSnapshot = {
        severity: residual.severity as SeverityLevel,
        likelihood: residual.likelihood as LikelihoodLevel,
        riskRating: residual.riskRating
      };
      dto.residualAssessment = residualDto;
      dto.residual = residualDto;
    }

    return dto;
  }
}

export type RiskAssessmentServiceType = RiskAssessmentService;
