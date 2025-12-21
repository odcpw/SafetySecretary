import { Prisma, type JhaAttachment } from "@prisma/client";
import prisma from "./prismaClient";
import { CreateJhaCaseInput, JhaHazardInput, JhaStepInput } from "../types/jha";

const caseInclude = {
  steps: {
    orderBy: { orderIndex: "asc" as const }
  },
  hazards: {
    orderBy: [{ stepId: "asc" as const }, { orderIndex: "asc" as const }, { createdAt: "asc" as const }]
  },
  attachments: {
    orderBy: { orderIndex: "asc" as const }
  }
} satisfies Prisma.JhaCaseInclude;

type CaseWithRelations = Prisma.JhaCaseGetPayload<{
  include: typeof caseInclude;
}>;

export type JhaCaseDto = CaseWithRelations;
export type JhaAttachmentDto = JhaAttachment;

export interface JhaCaseSummary {
  id: string;
  jobTitle: string;
  site: string | null;
  supervisor: string | null;
  workersInvolved: string | null;
  jobDate: Date | null;
  revision: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

const parseDate = (value: string | undefined | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeControls = (controls: string[] | string | null | undefined): string[] => {
  if (!controls) return [];
  if (Array.isArray(controls)) {
    return controls.map((control) => control.trim()).filter((control) => control.length > 0);
  }
  return controls
    .split(/\n|,/)
    .map((control) => control.trim())
    .filter((control) => control.length > 0);
};

export class JhaService {
  constructor(private readonly db = prisma) {}

  async connect(): Promise<void> {
    await this.db.$connect();
  }

  async disconnect(): Promise<void> {
    await this.db.$disconnect();
  }

  async listCases(params: { createdBy?: string | null; limit?: number } = {}): Promise<JhaCaseSummary[]> {
    const { createdBy, limit } = params;
    const take =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? Math.min(100, limit) : undefined;
    const cases = await this.db.jhaCase.findMany({
      ...(createdBy ? { where: { createdBy } } : {}),
      orderBy: { updatedAt: "desc" },
      ...(take ? { take } : {})
    });
    return cases.map((item) => ({
      id: item.id,
      jobTitle: item.jobTitle,
      site: item.site,
      supervisor: item.supervisor,
      workersInvolved: item.workersInvolved,
      jobDate: item.jobDate,
      revision: item.revision,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      createdBy: item.createdBy
    }));
  }

  async createCase(input: CreateJhaCaseInput): Promise<JhaCaseDto> {
    const created = await this.db.jhaCase.create({
      data: {
        jobTitle: input.jobTitle,
        site: input.site ?? null,
        supervisor: input.supervisor ?? null,
        workersInvolved: input.workersInvolved ?? null,
        jobDate: parseDate(input.jobDate),
        revision: input.revision ?? null,
        preparedBy: input.preparedBy ?? null,
        reviewedBy: input.reviewedBy ?? null,
        approvedBy: input.approvedBy ?? null,
        signoffDate: parseDate(input.signoffDate),
        workflowStage: input.workflowStage ?? "steps",
        createdBy: input.createdBy ?? null
      },
      include: caseInclude
    });
    return created;
  }

  async getCaseById(id: string): Promise<JhaCaseDto | null> {
    return this.db.jhaCase.findUnique({ where: { id }, include: caseInclude });
  }

  async updateCaseMeta(id: string, patch: Partial<CreateJhaCaseInput>): Promise<JhaCaseDto | null> {
    try {
      const data: Prisma.JhaCaseUpdateInput = {};
      if (patch.jobTitle !== undefined) {
        data.jobTitle = patch.jobTitle;
      }
      if (patch.site !== undefined) {
        data.site = patch.site;
      }
      if (patch.supervisor !== undefined) {
        data.supervisor = patch.supervisor;
      }
      if (patch.workersInvolved !== undefined) {
        data.workersInvolved = patch.workersInvolved;
      }
      if (patch.jobDate !== undefined) {
        data.jobDate = parseDate(patch.jobDate);
      }
      if (patch.revision !== undefined) {
        data.revision = patch.revision;
      }
      if (patch.preparedBy !== undefined) {
        data.preparedBy = patch.preparedBy;
      }
      if (patch.reviewedBy !== undefined) {
        data.reviewedBy = patch.reviewedBy;
      }
      if (patch.approvedBy !== undefined) {
        data.approvedBy = patch.approvedBy;
      }
      if (patch.signoffDate !== undefined) {
        data.signoffDate = parseDate(patch.signoffDate);
      }
      if (patch.workflowStage !== undefined) {
        data.workflowStage = patch.workflowStage;
      }

      const updated = await this.db.jhaCase.update({
        where: { id },
        data,
        include: caseInclude
      });
      return updated;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return null;
      }
      throw error;
    }
  }

  async deleteCase(id: string): Promise<boolean> {
    try {
      await this.db.jhaCase.delete({ where: { id } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return false;
      }
      throw error;
    }
  }

  private async stepIdsBelongToCase(caseId: string, stepIds: string[]): Promise<boolean> {
    if (stepIds.length === 0) return true;
    const count = await this.db.jhaStep.count({
      where: {
        caseId,
        id: { in: stepIds }
      }
    });
    return count === stepIds.length;
  }

  async updateSteps(caseId: string, steps: JhaStepInput[]): Promise<JhaCaseDto | null> {
    const jhaCase = await this.db.jhaCase.findUnique({ where: { id: caseId } });
    if (!jhaCase) return null;

    const stepIdsToUpdate = steps
      .map((step) => step.id)
      .filter((stepId): stepId is string => typeof stepId === "string" && stepId.length > 0);
    if (!(await this.stepIdsBelongToCase(caseId, stepIdsToUpdate))) {
      return null;
    }

    await this.db.$transaction(async (tx) => {
      const existingSteps = await tx.jhaStep.findMany({ where: { caseId } });
      const seen = new Set<string>();

      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index]!;
        const payload = {
          label: step.label,
          orderIndex: step.orderIndex ?? index
        };

        if (step.id) {
          seen.add(step.id);
          await tx.jhaStep.update({
            where: { id: step.id },
            data: payload
          });
        } else {
          const created = await tx.jhaStep.create({
            data: {
              caseId,
              ...payload
            }
          });
          seen.add(created.id);
        }
      }

      const obsolete = existingSteps.filter((step) => !seen.has(step.id)).map((step) => step.id);
      if (obsolete.length) {
        await tx.jhaStep.deleteMany({
          where: { id: { in: obsolete } }
        });
      }
    });

    return this.getCaseById(caseId);
  }

  async updateHazards(caseId: string, hazards: JhaHazardInput[]): Promise<JhaCaseDto | null> {
    const jhaCase = await this.db.jhaCase.findUnique({ where: { id: caseId } });
    if (!jhaCase) return null;

    const stepIds = Array.from(new Set(hazards.map((hazard) => hazard.stepId)));
    if (!(await this.stepIdsBelongToCase(caseId, stepIds))) {
      return null;
    }

    await this.db.$transaction(async (tx) => {
      const existingHazards = await tx.jhaHazard.findMany({ where: { caseId } });
      const seen = new Set<string>();

      for (let index = 0; index < hazards.length; index += 1) {
        const hazard = hazards[index]!;
        const payload = {
          stepId: hazard.stepId,
          hazard: hazard.hazard,
          consequence: hazard.consequence ?? null,
          controls: normalizeControls(hazard.controls),
          orderIndex: hazard.orderIndex ?? index
        };

        if (hazard.id) {
          seen.add(hazard.id);
          await tx.jhaHazard.update({
            where: { id: hazard.id },
            data: payload
          });
        } else {
          const created = await tx.jhaHazard.create({
            data: {
              caseId,
              ...payload
            }
          });
          seen.add(created.id);
        }
      }

      const obsolete = existingHazards.filter((hazard) => !seen.has(hazard.id)).map((hazard) => hazard.id);
      if (obsolete.length) {
        await tx.jhaHazard.deleteMany({
          where: { id: { in: obsolete } }
        });
      }
    });

    return this.getCaseById(caseId);
  }

  async replaceRowsFromExtraction(
    caseId: string,
    rows: Array<{ step: string; hazard: string; consequence?: string | null; controls?: string[] | string | null }>
  ): Promise<JhaCaseDto | null> {
    const jhaCase = await this.db.jhaCase.findUnique({ where: { id: caseId } });
    if (!jhaCase) return null;

    await this.db.$transaction(async (tx) => {
      await tx.jhaHazard.deleteMany({ where: { caseId } });
      await tx.jhaStep.deleteMany({ where: { caseId } });

      const stepIds = new Map<string, { id: string; orderIndex: number }>();
      let stepOrder = 0;

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]!;
        const stepLabel = row.step?.trim() || `Step ${stepOrder + 1}`;
        let step = stepIds.get(stepLabel);
        if (!step) {
          const created = await tx.jhaStep.create({
            data: { caseId, label: stepLabel, orderIndex: stepOrder }
          });
          step = { id: created.id, orderIndex: stepOrder };
          stepIds.set(stepLabel, step);
          stepOrder += 1;
        }

        await tx.jhaHazard.create({
          data: {
            caseId,
            stepId: step.id,
            orderIndex: index,
            hazard: row.hazard?.trim() || "",
            consequence: row.consequence ?? null,
            controls: normalizeControls(row.controls)
          }
        });
      }
    });

    return this.getCaseById(caseId);
  }

  async listAttachments(caseId: string): Promise<JhaAttachmentDto[]> {
    return this.db.jhaAttachment.findMany({
      where: { caseId },
      orderBy: { orderIndex: "asc" }
    });
  }

  async addStepAttachment(
    caseId: string,
    stepId: string,
    payload: { originalName: string; mimeType: string; byteSize: number; storageKey: string }
  ): Promise<JhaAttachmentDto | null> {
    const step = await this.db.jhaStep.findFirst({
      where: { id: stepId, caseId }
    });
    if (!step) return null;

    return this.db.$transaction(async (tx) => {
      const orderIndex = await tx.jhaAttachment.count({ where: { caseId, stepId, hazardId: null } });
      return tx.jhaAttachment.create({
        data: {
          caseId,
          stepId,
          hazardId: null,
          orderIndex,
          originalName: payload.originalName,
          mimeType: payload.mimeType,
          byteSize: payload.byteSize,
          storageKey: payload.storageKey
        }
      });
    });
  }

  async addHazardAttachment(
    caseId: string,
    hazardId: string,
    payload: { originalName: string; mimeType: string; byteSize: number; storageKey: string }
  ): Promise<JhaAttachmentDto | null> {
    const hazard = await this.db.jhaHazard.findFirst({
      where: { id: hazardId, caseId }
    });
    if (!hazard) return null;

    return this.db.$transaction(async (tx) => {
      const orderIndex = await tx.jhaAttachment.count({ where: { caseId, hazardId } });
      return tx.jhaAttachment.create({
        data: {
          caseId,
          hazardId,
          orderIndex,
          originalName: payload.originalName,
          mimeType: payload.mimeType,
          byteSize: payload.byteSize,
          storageKey: payload.storageKey
        }
      });
    });
  }

  async getAttachment(caseId: string, attachmentId: string): Promise<JhaAttachmentDto | null> {
    return this.db.jhaAttachment.findFirst({
      where: { id: attachmentId, caseId }
    });
  }

  async updateAttachment(
    caseId: string,
    attachmentId: string,
    patch: { stepId?: string | null; hazardId?: string | null }
  ): Promise<JhaAttachmentDto | null> {
    const attachment = await this.db.jhaAttachment.findFirst({ where: { id: attachmentId, caseId } });
    if (!attachment) return null;

    const nextHazardId = patch.hazardId !== undefined ? patch.hazardId : attachment.hazardId;
    const nextStepId =
      nextHazardId ? null : patch.stepId !== undefined ? patch.stepId : attachment.stepId;
    if (!nextStepId && !nextHazardId) {
      return null;
    }

    if (nextStepId) {
      const step = await this.db.jhaStep.findFirst({ where: { id: nextStepId, caseId } });
      if (!step) return null;
    }
    if (nextHazardId) {
      const hazard = await this.db.jhaHazard.findFirst({ where: { id: nextHazardId, caseId } });
      if (!hazard) return null;
    }

    const updated = await this.db.$transaction(async (tx) => {
      const orderIndex =
        nextHazardId !== null && nextHazardId !== undefined
          ? await tx.jhaAttachment.count({ where: { caseId, hazardId: nextHazardId } })
          : nextStepId
            ? await tx.jhaAttachment.count({ where: { caseId, stepId: nextStepId, hazardId: null } })
            : attachment.orderIndex;

      const updatedRow = await tx.jhaAttachment.update({
        where: { id: attachmentId },
        data: {
          stepId: nextStepId,
          hazardId: nextHazardId,
          orderIndex
        }
      });

      if (attachment.hazardId && attachment.hazardId !== nextHazardId) {
        await this.normalizeHazardAttachmentOrder(tx, caseId, attachment.hazardId);
      }
      if (attachment.stepId && attachment.stepId !== nextStepId) {
        await this.normalizeStepAttachmentOrder(tx, caseId, attachment.stepId);
      }
      if (updatedRow.hazardId) {
        await this.normalizeHazardAttachmentOrder(tx, caseId, updatedRow.hazardId);
      }
      if (updatedRow.stepId) {
        await this.normalizeStepAttachmentOrder(tx, caseId, updatedRow.stepId);
      }

      return updatedRow;
    });

    return updated;
  }

  async deleteAttachment(caseId: string, attachmentId: string): Promise<JhaAttachmentDto | null> {
    const attachment = await this.db.jhaAttachment.findFirst({ where: { id: attachmentId, caseId } });
    if (!attachment) return null;

    await this.db.$transaction(async (tx) => {
      await tx.jhaAttachment.delete({ where: { id: attachmentId } });
      if (attachment.hazardId) {
        await this.normalizeHazardAttachmentOrder(tx, caseId, attachment.hazardId);
      }
      if (attachment.stepId) {
        await this.normalizeStepAttachmentOrder(tx, caseId, attachment.stepId);
      }
    });

    return attachment;
  }

  async reorderStepAttachments(caseId: string, stepId: string, attachmentIds: string[]): Promise<boolean> {
    const attachments = await this.db.jhaAttachment.findMany({
      where: { caseId, stepId, hazardId: null },
      select: { id: true }
    });
    const ids = new Set(attachments.map((item) => item.id));
    if (attachmentIds.some((id) => !ids.has(id))) {
      return false;
    }

    await this.db.$transaction(async (tx) => {
      for (let index = 0; index < attachmentIds.length; index += 1) {
        await tx.jhaAttachment.update({
          where: { id: attachmentIds[index]! },
          data: { orderIndex: index }
        });
      }
    });

    return true;
  }

  private async normalizeStepAttachmentOrder(
    tx: Prisma.TransactionClient,
    caseId: string,
    stepId: string
  ): Promise<void> {
    const items = await tx.jhaAttachment.findMany({
      where: { caseId, stepId, hazardId: null },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      select: { id: true }
    });
    await Promise.all(
      items.map((item, index) =>
        tx.jhaAttachment.update({
          where: { id: item.id },
          data: { orderIndex: index }
        })
      )
    );
  }

  private async normalizeHazardAttachmentOrder(
    tx: Prisma.TransactionClient,
    caseId: string,
    hazardId: string
  ): Promise<void> {
    const items = await tx.jhaAttachment.findMany({
      where: { caseId, hazardId },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      select: { id: true }
    });
    await Promise.all(
      items.map((item, index) =>
        tx.jhaAttachment.update({
          where: { id: item.id },
          data: { orderIndex: index }
        })
      )
    );
  }
}
