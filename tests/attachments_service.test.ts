import { describe, expect, it, vi } from "vitest";
import { RiskAssessmentService } from "../src/services/raService";

describe("RiskAssessmentService attachments (unit)", () => {
  it("rejects addStepAttachment when step does not belong to case", async () => {
    const mockDb: any = {
      processStep: { findFirst: vi.fn().mockResolvedValue(null) }
    };
    const service = new RiskAssessmentService(mockDb);

    const result = await service.addStepAttachment("case-a", "step-other", {
      originalName: "photo.png",
      mimeType: "image/png",
      byteSize: 10,
      storageKey: "case-a/id-photo.png"
    });

    expect(result).toBeNull();
  });

  it("creates step attachment with next orderIndex", async () => {
    const created = {
      id: "att-1",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-01T00:00:00Z"),
      caseId: "case-a",
      stepId: "step-1",
      hazardId: null,
      orderIndex: 2,
      originalName: "photo.png",
      mimeType: "image/png",
      byteSize: 10,
      storageKey: "case-a/att-1-photo.png"
    };

    const tx: any = {
      attachment: {
        count: vi.fn().mockResolvedValue(2),
        create: vi.fn().mockResolvedValue(created)
      }
    };

    const mockDb: any = {
      processStep: { findFirst: vi.fn().mockResolvedValue({ id: "step-1", caseId: "case-a" }) },
      $transaction: vi.fn(async (fn: any) => fn(tx))
    };

    const service = new RiskAssessmentService(mockDb);
    const result = await service.addStepAttachment("case-a", "step-1", {
      originalName: "photo.png",
      mimeType: "image/png",
      byteSize: 10,
      storageKey: "case-a/att-1-photo.png"
    });

    expect(result?.orderIndex).toBe(2);
    expect(tx.attachment.create).toHaveBeenCalled();
  });

  it("rejects addHazardAttachment when hazard does not belong to case", async () => {
    const mockDb: any = {
      hazard: { findFirst: vi.fn().mockResolvedValue(null) }
    };
    const service = new RiskAssessmentService(mockDb);

    const result = await service.addHazardAttachment("case-a", "haz-other", {
      originalName: "photo.png",
      mimeType: "image/png",
      byteSize: 10,
      storageKey: "case-a/id-photo.png"
    });

    expect(result).toBeNull();
  });
});

