import { Prisma, type IncidentAccount, type IncidentAttachment, type IncidentPerson } from "@prisma/client";
import prisma from "./prismaClient";
import {
  CreateIncidentCaseInput,
  IncidentActionInput,
  IncidentCauseActionInput,
  IncidentCauseNodeInput,
  IncidentCaseSummary,
  IncidentDeviationInput,
  IncidentPersonInput,
  IncidentPersonalEventInput,
  IncidentFactInput,
  IncidentTimelineConfidence,
  IncidentTimelineEventInput
} from "../types/incident";

const caseInclude = {
  persons: {
    orderBy: { createdAt: "asc" as const }
  },
  accounts: {
    include: {
      person: true,
      facts: { orderBy: { orderIndex: "asc" as const } },
      personalEvents: { orderBy: { orderIndex: "asc" as const } }
    },
    orderBy: { createdAt: "asc" as const }
  },
  timelineEvents: {
    include: {
      sources: {
        include: { account: true, fact: true, personalEvent: true },
        orderBy: { createdAt: "asc" as const }
      }
    },
    orderBy: { orderIndex: "asc" as const }
  },
  deviations: {
    include: {
      causes: {
        include: { actions: { orderBy: { orderIndex: "asc" as const } } },
        orderBy: { orderIndex: "asc" as const }
      }
    },
    orderBy: { orderIndex: "asc" as const }
  },
  causeNodes: {
    include: {
      actions: { orderBy: { orderIndex: "asc" as const } }
    },
    orderBy: { orderIndex: "asc" as const }
  },
  attachments: {
    orderBy: { orderIndex: "asc" as const }
  }
} satisfies Prisma.IncidentCaseInclude;

type CaseWithRelations = Prisma.IncidentCaseGetPayload<{
  include: typeof caseInclude;
}>;

export type IncidentCaseDto = CaseWithRelations;
export type IncidentAttachmentDto = IncidentAttachment;

type TimelineSourceInput = {
  accountId: string;
  factId?: string | null;
  personalEventId?: string | null;
};

type TimelineMergeRow = {
  eventAt?: string | null;
  timeLabel?: string | null;
  text: string;
  confidence?: IncidentTimelineConfidence;
  sources?: TimelineSourceInput[];
};

const parseDate = (value: string | undefined | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export class IncidentService {
  constructor(private readonly db = prisma) {}

  async connect(): Promise<void> {
    await this.db.$connect();
  }

  async disconnect(): Promise<void> {
    await this.db.$disconnect();
  }

  async listCases(params: { createdBy?: string | null; limit?: number } = {}): Promise<IncidentCaseSummary[]> {
    const { createdBy, limit } = params;
    const take =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? Math.min(100, limit) : undefined;
    const cases = await this.db.incidentCase.findMany({
      ...(createdBy ? { where: { createdBy } } : {}),
      orderBy: { updatedAt: "desc" },
      ...(take ? { take } : {})
    });
    return cases.map((item) => ({
      id: item.id,
      title: item.title,
      workflowStage: item.workflowStage,
      incidentAt: item.incidentAt,
      incidentTimeNote: item.incidentTimeNote,
      location: item.location,
      incidentType: item.incidentType,
      coordinatorRole: item.coordinatorRole,
      coordinatorName: item.coordinatorName,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      createdBy: item.createdBy
    }));
  }

  async createCase(input: CreateIncidentCaseInput): Promise<IncidentCaseDto> {
    const data: Prisma.IncidentCaseCreateInput = {
      title: input.title,
      incidentAt: parseDate(input.incidentAt),
      incidentTimeNote: input.incidentTimeNote ?? null,
      location: input.location ?? null,
      incidentType: input.incidentType,
      coordinatorRole: input.coordinatorRole,
      coordinatorName: input.coordinatorName ?? null,
      createdBy: input.createdBy ?? null
    };
    if (typeof input.workflowStage === "string") {
      data.workflowStage = input.workflowStage;
    }
    return this.db.incidentCase.create({
      data,
      include: caseInclude
    });
  }

  async getCaseById(id: string): Promise<IncidentCaseDto | null> {
    return this.db.incidentCase.findUnique({ where: { id }, include: caseInclude });
  }

  async updateCaseMeta(id: string, patch: Partial<CreateIncidentCaseInput>): Promise<IncidentCaseDto | null> {
    try {
      const data: Prisma.IncidentCaseUpdateInput = {};
      if (patch.title !== undefined) {
        data.title = patch.title;
      }
      if (patch.workflowStage !== undefined) {
        data.workflowStage = patch.workflowStage;
      }
      if (patch.incidentAt !== undefined) {
        data.incidentAt = parseDate(patch.incidentAt);
      }
      if (patch.incidentTimeNote !== undefined) {
        data.incidentTimeNote = patch.incidentTimeNote;
      }
      if (patch.location !== undefined) {
        data.location = patch.location;
      }
      if (patch.incidentType !== undefined) {
        data.incidentType = patch.incidentType;
      }
      if (patch.coordinatorRole !== undefined) {
        data.coordinatorRole = patch.coordinatorRole;
      }
      if (patch.coordinatorName !== undefined) {
        data.coordinatorName = patch.coordinatorName;
      }

      return await this.db.incidentCase.update({
        where: { id },
        data,
        include: caseInclude
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return null;
      }
      throw error;
    }
  }

  async updateAssistantDraft(
    caseId: string,
    input: { narrative?: string | null; draft?: Prisma.InputJsonValue | null }
  ): Promise<IncidentCaseDto | null> {
    const data: Prisma.IncidentCaseUpdateInput = {};
    if (input.narrative !== undefined) {
      data.assistantNarrative = input.narrative;
    }
    if (input.draft !== undefined) {
      data.assistantDraft = input.draft === null ? Prisma.DbNull : input.draft;
    }
    if (!Object.keys(data).length) {
      return this.getCaseById(caseId);
    }
    data.assistantDraftUpdatedAt = new Date();

    try {
      return await this.db.incidentCase.update({
        where: { id: caseId },
        data,
        include: caseInclude
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return null;
      }
      throw error;
    }
  }

  async deleteCase(id: string): Promise<boolean> {
    try {
      await this.db.incidentCase.delete({ where: { id } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return false;
      }
      throw error;
    }
  }

  async addPerson(caseId: string, input: IncidentPersonInput): Promise<IncidentPerson | null> {
    const incidentCase = await this.db.incidentCase.findUnique({ where: { id: caseId } });
    if (!incidentCase) return null;

    return this.db.incidentPerson.create({
      data: {
        caseId,
        role: input.role,
        name: input.name ?? null,
        otherInfo: input.otherInfo ?? null
      }
    });
  }

  async updatePerson(caseId: string, personId: string, patch: IncidentPersonInput): Promise<IncidentPerson | null> {
    const person = await this.db.incidentPerson.findFirst({ where: { id: personId, caseId } });
    if (!person) return null;

    return this.db.incidentPerson.update({
      where: { id: personId },
      data: {
        role: patch.role,
        name: patch.name ?? null,
        otherInfo: patch.otherInfo ?? null
      }
    });
  }

  async addAccount(caseId: string, personId: string, rawStatement?: string): Promise<IncidentAccount | null> {
    const person = await this.db.incidentPerson.findFirst({ where: { id: personId, caseId } });
    if (!person) return null;

    return this.db.incidentAccount.create({
      data: {
        caseId,
        personId,
        rawStatement: rawStatement ?? null
      }
    });
  }

  async updateAccount(caseId: string, accountId: string, rawStatement?: string): Promise<IncidentAccount | null> {
    const account = await this.db.incidentAccount.findFirst({ where: { id: accountId, caseId } });
    if (!account) return null;

    return this.db.incidentAccount.update({
      where: { id: accountId },
      data: { rawStatement: rawStatement ?? null }
    });
  }

  async replaceAccountFacts(caseId: string, accountId: string, facts: IncidentFactInput[]): Promise<boolean> {
    const account = await this.db.incidentAccount.findFirst({ where: { id: accountId, caseId } });
    if (!account) return false;

    await this.db.$transaction(async (tx) => {
      await tx.incidentFact.deleteMany({ where: { accountId } });
      for (let index = 0; index < facts.length; index += 1) {
        const fact = facts[index]!;
        await tx.incidentFact.create({
          data: {
            accountId,
            orderIndex: fact.orderIndex ?? index,
            text: fact.text
          }
        });
      }
    });

    return true;
  }

  async replaceAccountPersonalEvents(
    caseId: string,
    accountId: string,
    events: IncidentPersonalEventInput[]
  ): Promise<boolean> {
    const account = await this.db.incidentAccount.findFirst({ where: { id: accountId, caseId } });
    if (!account) return false;

    await this.db.$transaction(async (tx) => {
      await tx.incidentPersonalEvent.deleteMany({ where: { accountId } });
      for (let index = 0; index < events.length; index += 1) {
        const event = events[index]!;
        await tx.incidentPersonalEvent.create({
          data: {
            accountId,
            orderIndex: event.orderIndex ?? index,
            eventAt: parseDate(event.eventAt),
            timeLabel: event.timeLabel ?? null,
            text: event.text
          }
        });
      }
    });

    return true;
  }

  async replaceTimelineFromMerge(caseId: string, rows: TimelineMergeRow[]): Promise<IncidentCaseDto | null> {
    const incidentCase = await this.db.incidentCase.findUnique({ where: { id: caseId } });
    if (!incidentCase) return null;

    await this.db.$transaction(async (tx) => {
      await tx.incidentTimelineSource.deleteMany({ where: { timelineEvent: { caseId } } });
      await tx.incidentTimelineEvent.deleteMany({ where: { caseId } });

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]!;
        const event = await tx.incidentTimelineEvent.create({
          data: {
            caseId,
            orderIndex: index,
            eventAt: parseDate(row.eventAt),
            timeLabel: row.timeLabel ?? null,
            text: row.text,
            confidence: row.confidence ?? IncidentTimelineConfidence.LIKELY
          }
        });

        const sources = row.sources ?? [];
        if (sources.length) {
          await tx.incidentTimelineSource.createMany({
            data: sources.map((source) => ({
              timelineEventId: event.id,
              accountId: source.accountId,
              factId: source.factId ?? null,
              personalEventId: source.personalEventId ?? null
            }))
          });
        }
      }
    });

    return this.getCaseById(caseId);
  }

  async updateTimelineEvents(caseId: string, events: IncidentTimelineEventInput[]): Promise<IncidentCaseDto | null> {
    const incidentCase = await this.db.incidentCase.findUnique({ where: { id: caseId } });
    if (!incidentCase) return null;

    await this.db.$transaction(async (tx) => {
      const existing = await tx.incidentTimelineEvent.findMany({ where: { caseId } });
      const seen = new Set<string>();

      for (let index = 0; index < events.length; index += 1) {
        const event = events[index]!;
        const payload = {
          orderIndex: event.orderIndex ?? index,
          eventAt: parseDate(event.eventAt),
          timeLabel: event.timeLabel ?? null,
          text: event.text,
          confidence: event.confidence ?? IncidentTimelineConfidence.LIKELY
        };

        if (event.id) {
          seen.add(event.id);
          await tx.incidentTimelineEvent.update({
            where: { id: event.id },
            data: payload
          });
        } else {
          const created = await tx.incidentTimelineEvent.create({
            data: {
              caseId,
              ...payload
            }
          });
          seen.add(created.id);
        }
      }

      const obsolete = existing.filter((item) => !seen.has(item.id)).map((item) => item.id);
      if (obsolete.length) {
        await tx.incidentTimelineEvent.deleteMany({ where: { id: { in: obsolete } } });
      }
    });

    return this.getCaseById(caseId);
  }

  async updateDeviations(caseId: string, deviations: IncidentDeviationInput[]): Promise<IncidentCaseDto | null> {
    const incidentCase = await this.db.incidentCase.findUnique({ where: { id: caseId } });
    if (!incidentCase) return null;

    await this.db.$transaction(async (tx) => {
      const existing = await tx.incidentDeviation.findMany({ where: { caseId } });
      const seen = new Set<string>();

      for (let index = 0; index < deviations.length; index += 1) {
        const deviation = deviations[index]!;
        const payload = {
          timelineEventId: deviation.timelineEventId ?? null,
          orderIndex: deviation.orderIndex ?? index,
          expected: deviation.expected ?? null,
          actual: deviation.actual ?? null,
          changeObserved: deviation.changeObserved ?? null
        };

        if (deviation.id) {
          seen.add(deviation.id);
          await tx.incidentDeviation.update({
            where: { id: deviation.id },
            data: payload
          });
        } else {
          const created = await tx.incidentDeviation.create({
            data: {
              caseId,
              ...payload
            }
          });
          seen.add(created.id);
        }
      }

      const obsolete = existing.filter((item) => !seen.has(item.id)).map((item) => item.id);
      if (obsolete.length) {
        await tx.incidentDeviation.deleteMany({ where: { id: { in: obsolete } } });
      }
    });

    return this.getCaseById(caseId);
  }

  async updateCauses(caseId: string, causes: { id?: string; deviationId: string; orderIndex?: number; statement: string }[]): Promise<IncidentCaseDto | null> {
    const incidentCase = await this.db.incidentCase.findUnique({ where: { id: caseId } });
    if (!incidentCase) return null;

    const deviationIds = Array.from(new Set(causes.map((item) => item.deviationId)));
    const validDeviationCount = await this.db.incidentDeviation.count({
      where: { caseId, id: { in: deviationIds } }
    });
    if (validDeviationCount !== deviationIds.length) return null;

    await this.db.$transaction(async (tx) => {
      const existing = await tx.incidentCause.findMany({
        where: { deviation: { caseId } }
      });
      const seen = new Set<string>();

      for (let index = 0; index < causes.length; index += 1) {
        const cause = causes[index]!;
        const payload = {
          deviationId: cause.deviationId,
          orderIndex: cause.orderIndex ?? index,
          statement: cause.statement
        };

        if (cause.id) {
          seen.add(cause.id);
          await tx.incidentCause.update({ where: { id: cause.id }, data: payload });
        } else {
          const created = await tx.incidentCause.create({ data: payload });
          seen.add(created.id);
        }
      }

      const obsolete = existing.filter((item) => !seen.has(item.id)).map((item) => item.id);
      if (obsolete.length) {
        await tx.incidentCause.deleteMany({ where: { id: { in: obsolete } } });
      }
    });

    return this.getCaseById(caseId);
  }

  async updateActions(caseId: string, actions: IncidentActionInput[]): Promise<IncidentCaseDto | null> {
    const incidentCase = await this.db.incidentCase.findUnique({ where: { id: caseId } });
    if (!incidentCase) return null;

    const causeIds = Array.from(new Set(actions.map((item) => item.causeId)));
    const validCauseCount = await this.db.incidentCause.count({
      where: { deviation: { caseId }, id: { in: causeIds } }
    });
    if (validCauseCount !== causeIds.length) return null;

    await this.db.$transaction(async (tx) => {
      const existing = await tx.incidentAction.findMany({
        where: { cause: { deviation: { caseId } } }
      });
      const seen = new Set<string>();

      for (let index = 0; index < actions.length; index += 1) {
        const action = actions[index]!;
        const payload = {
          causeId: action.causeId,
          orderIndex: action.orderIndex ?? index,
          description: action.description,
          ownerRole: action.ownerRole ?? null,
          dueDate: action.dueDate ? parseDate(action.dueDate) : null,
          actionType: action.actionType ?? null
        };

        if (action.id) {
          seen.add(action.id);
          await tx.incidentAction.update({ where: { id: action.id }, data: payload });
        } else {
          const created = await tx.incidentAction.create({ data: payload });
          seen.add(created.id);
        }
      }

      const obsolete = existing.filter((item) => !seen.has(item.id)).map((item) => item.id);
      if (obsolete.length) {
        await tx.incidentAction.deleteMany({ where: { id: { in: obsolete } } });
      }
    });

    return this.getCaseById(caseId);
  }

  async updateCauseNodes(caseId: string, nodes: IncidentCauseNodeInput[]): Promise<IncidentCaseDto | null> {
    const incidentCase = await this.db.incidentCase.findUnique({ where: { id: caseId } });
    if (!incidentCase) return null;

    await this.db.$transaction(async (tx) => {
      const existing = await tx.incidentCauseNode.findMany({ where: { caseId } });
      const seen = new Set<string>();

      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index]!;
        const payload = {
          caseId,
          parentId: node.parentId ?? null,
          timelineEventId: node.timelineEventId ?? null,
          orderIndex: node.orderIndex ?? index,
          statement: node.statement,
          question: node.question ?? null,
          isRootCause: Boolean(node.isRootCause)
        };

        if (node.id) {
          await tx.incidentCauseNode.upsert({
            where: { id: node.id },
            create: { id: node.id, ...payload },
            update: payload
          });
          seen.add(node.id);
        } else {
          const created = await tx.incidentCauseNode.create({ data: payload });
          seen.add(created.id);
        }
      }

      const obsolete = existing.filter((item) => !seen.has(item.id)).map((item) => item.id);
      if (obsolete.length) {
        await tx.incidentCauseNode.deleteMany({ where: { id: { in: obsolete } } });
      }
    });

    return this.getCaseById(caseId);
  }

  async updateCauseActions(caseId: string, actions: IncidentCauseActionInput[]): Promise<IncidentCaseDto | null> {
    const incidentCase = await this.db.incidentCase.findUnique({ where: { id: caseId } });
    if (!incidentCase) return null;

    const causeNodeIds = Array.from(new Set(actions.map((item) => item.causeNodeId)));
    const validCount = await this.db.incidentCauseNode.count({
      where: { caseId, id: { in: causeNodeIds } }
    });
    if (validCount !== causeNodeIds.length) return null;

    await this.db.$transaction(async (tx) => {
      const existing = await tx.incidentCauseAction.findMany({
        where: { causeNode: { caseId } }
      });
      const seen = new Set<string>();

      for (let index = 0; index < actions.length; index += 1) {
        const action = actions[index]!;
        const payload = {
          causeNodeId: action.causeNodeId,
          orderIndex: action.orderIndex ?? index,
          description: action.description,
          ownerRole: action.ownerRole ?? null,
          dueDate: action.dueDate ? parseDate(action.dueDate) : null,
          actionType: action.actionType ?? null
        };

        if (action.id) {
          await tx.incidentCauseAction.upsert({
            where: { id: action.id },
            create: { id: action.id, ...payload },
            update: payload
          });
          seen.add(action.id);
        } else {
          const created = await tx.incidentCauseAction.create({ data: payload });
          seen.add(created.id);
        }
      }

      const obsolete = existing.filter((item) => !seen.has(item.id)).map((item) => item.id);
      if (obsolete.length) {
        await tx.incidentCauseAction.deleteMany({ where: { id: { in: obsolete } } });
      }
    });

    return this.getCaseById(caseId);
  }

  async listAttachments(caseId: string): Promise<IncidentAttachmentDto[]> {
    return this.db.incidentAttachment.findMany({
      where: { caseId },
      orderBy: { orderIndex: "asc" }
    });
  }

  async addTimelineAttachment(
    caseId: string,
    timelineEventId: string,
    input: { originalName: string; mimeType: string; byteSize: number; storageKey: string }
  ): Promise<IncidentAttachmentDto | null> {
    const event = await this.db.incidentTimelineEvent.findFirst({ where: { id: timelineEventId, caseId } });
    if (!event) return null;

    const attachment = await this.db.$transaction(async (tx) => {
      const orderIndex = await tx.incidentAttachment.count({ where: { caseId, timelineEventId } });
      return tx.incidentAttachment.create({
        data: {
          caseId,
          timelineEventId,
          orderIndex,
          originalName: input.originalName,
          mimeType: input.mimeType,
          byteSize: input.byteSize,
          storageKey: input.storageKey
        }
      });
    });

    return attachment;
  }

  async getAttachment(caseId: string, attachmentId: string): Promise<IncidentAttachmentDto | null> {
    return this.db.incidentAttachment.findFirst({ where: { id: attachmentId, caseId } });
  }

  async updateAttachment(
    caseId: string,
    attachmentId: string,
    patch: { timelineEventId?: string | null }
  ): Promise<IncidentAttachmentDto | null> {
    const attachment = await this.db.incidentAttachment.findFirst({ where: { id: attachmentId, caseId } });
    if (!attachment) return null;

    const nextEventId = patch.timelineEventId !== undefined ? patch.timelineEventId : attachment.timelineEventId;
    if (!nextEventId) return null;

    const event = await this.db.incidentTimelineEvent.findFirst({ where: { id: nextEventId, caseId } });
    if (!event) return null;

    const updated = await this.db.$transaction(async (tx) => {
      const orderIndex = await tx.incidentAttachment.count({
        where: { caseId, timelineEventId: nextEventId }
      });
      const updatedRow = await tx.incidentAttachment.update({
        where: { id: attachmentId },
        data: { timelineEventId: nextEventId, orderIndex }
      });
      if (attachment.timelineEventId && attachment.timelineEventId !== nextEventId) {
        await this.normalizeAttachmentOrder(tx, caseId, attachment.timelineEventId);
      }
      await this.normalizeAttachmentOrder(tx, caseId, nextEventId);
      return updatedRow;
    });

    return updated;
  }

  async deleteAttachment(caseId: string, attachmentId: string): Promise<IncidentAttachmentDto | null> {
    const attachment = await this.db.incidentAttachment.findFirst({ where: { id: attachmentId, caseId } });
    if (!attachment) return null;

    await this.db.$transaction(async (tx) => {
      await tx.incidentAttachment.delete({ where: { id: attachmentId } });
      if (attachment.timelineEventId) {
        await this.normalizeAttachmentOrder(tx, caseId, attachment.timelineEventId);
      }
    });

    return attachment;
  }

  async reorderTimelineAttachments(caseId: string, timelineEventId: string, attachmentIds: string[]): Promise<boolean> {
    const attachments = await this.db.incidentAttachment.findMany({
      where: { caseId, timelineEventId },
      select: { id: true }
    });
    const ids = new Set(attachments.map((item) => item.id));
    if (attachmentIds.some((id) => !ids.has(id))) {
      return false;
    }

    await this.db.$transaction(async (tx) => {
      for (let index = 0; index < attachmentIds.length; index += 1) {
        await tx.incidentAttachment.update({
          where: { id: attachmentIds[index]! },
          data: { orderIndex: index }
        });
      }
    });

    return true;
  }

  private async normalizeAttachmentOrder(
    tx: Prisma.TransactionClient,
    caseId: string,
    timelineEventId: string
  ): Promise<void> {
    const items = await tx.incidentAttachment.findMany({
      where: { caseId, timelineEventId },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      select: { id: true }
    });
    await Promise.all(
      items.map((item, index) =>
        tx.incidentAttachment.update({
          where: { id: item.id },
          data: { orderIndex: index }
        })
      )
    );
  }
}
