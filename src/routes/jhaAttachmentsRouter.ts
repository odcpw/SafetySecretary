import { Router, Request, Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { env } from "../config/env";
import { AppLocals } from "../types/app";
import { decryptAttachment, encryptAttachment } from "../services/attachmentCrypto";
import { resolveStoragePath } from "../services/storagePaths";

const jhaAttachmentsRouter = Router({ mergeParams: true });

const getTenantServices = (req: Request) => {
  if (!req.tenantServices) {
    throw new Error("Tenant services not available");
  }
  return req.tenantServices;
};

const getRegistryService = (req: Request) => (req.app.locals as AppLocals).registryService;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.attachmentMaxBytes }
});

const safeFileComponent = (value: string) =>
  value
    .replace(/[\\/]/g, "_")
    .replace(/[^\w.\-() ]+/g, "_")
    .trim()
    .slice(0, 120) || "upload";

const buildStorageKey = (caseId: string, attachmentId: string, originalName: string) => {
  const safeName = safeFileComponent(originalName);
  return path.posix.join("jha", caseId, `${attachmentId}-${safeName}`);
};

const requireStorageRoot = (req: Request, res: Response) => {
  if (!req.auth) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.auth.storageRoot || env.attachmentsDir;
};

const requireEncryptionKey = async (req: Request, res: Response): Promise<Buffer | null> => {
  if (!req.auth) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const registry = getRegistryService(req);
  const keyRef = req.auth.encryptionKeyRef ?? (await registry.ensureOrgEncryptionKey(req.auth.orgId));
  if (!keyRef) {
    res.status(500).json({ error: "Encryption key unavailable" });
    return null;
  }
  const key = Buffer.from(keyRef, "base64");
  if (key.length !== 32) {
    res.status(500).json({ error: "Encryption key invalid" });
    return null;
  }
  req.auth.encryptionKeyRef = keyRef;
  return key;
};

const requireCaseId = (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!caseId) {
    res.status(400).json({ error: "case id parameter is required" });
    return null;
  }
  return caseId;
};

jhaAttachmentsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const caseId = requireCaseId(req, res);
    if (!caseId) return;

    const { jhaService } = getTenantServices(req);
    const attachments = await jhaService.listAttachments(caseId);
    res.json(
      attachments.map((attachment) => ({
        ...attachment,
        url: `/api/jha-cases/${caseId}/attachments/${attachment.id}/download`
      }))
    );
  } catch (error) {
    console.error("[jhaAttachmentsRouter] list attachments", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

jhaAttachmentsRouter.post("/steps/:stepId", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const caseId = requireCaseId(req, res);
    if (!caseId) return;
    const stepId = req.params.stepId;
    if (!stepId) {
      return res.status(400).json({ error: "stepId parameter is required" });
    }
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "file field is required" });
    }

    const { jhaService } = getTenantServices(req);
    const storageRoot = requireStorageRoot(req, res);
    if (!storageRoot) return;
    const encryptionKey = await requireEncryptionKey(req, res);
    if (!encryptionKey) return;
    const attachmentId = randomUUID();
    const storageKey = buildStorageKey(caseId, attachmentId, file.originalname);
    const { filePath } = resolveStoragePath(storageRoot, storageKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, encryptAttachment(file.buffer, encryptionKey));

    try {
      const created = await jhaService.addStepAttachment(caseId, stepId, {
        originalName: file.originalname,
        mimeType: file.mimetype,
        byteSize: file.size,
        storageKey
      });
      if (!created) {
        await fs.unlink(filePath).catch(() => undefined);
        return res.status(404).json({ error: "Not found" });
      }
      res.status(201).json({
        ...created,
        url: `/api/jha-cases/${caseId}/attachments/${created.id}/download`
      });
    } catch (error) {
      await fs.unlink(filePath).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error("[jhaAttachmentsRouter] upload step attachment", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

jhaAttachmentsRouter.put("/steps/:stepId/order", async (req: Request, res: Response) => {
  try {
    const caseId = requireCaseId(req, res);
    if (!caseId) return;
    const stepId = req.params.stepId;
    if (!stepId) {
      return res.status(400).json({ error: "stepId parameter is required" });
    }

    const attachmentIdsRaw = (req.body as any)?.attachmentIds;
    if (!Array.isArray(attachmentIdsRaw) || !attachmentIdsRaw.every((id) => typeof id === "string")) {
      return res.status(400).json({ error: "attachmentIds must be an array of strings" });
    }

    const { jhaService } = getTenantServices(req);
    const ok = await jhaService.reorderStepAttachments(caseId, stepId, attachmentIdsRaw);
    if (!ok) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("[jhaAttachmentsRouter] reorder step attachments", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

jhaAttachmentsRouter.post("/hazards/:hazardId", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const caseId = requireCaseId(req, res);
    if (!caseId) return;
    const hazardId = req.params.hazardId;
    if (!hazardId) {
      return res.status(400).json({ error: "hazardId parameter is required" });
    }
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "file field is required" });
    }

    const { jhaService } = getTenantServices(req);
    const storageRoot = requireStorageRoot(req, res);
    if (!storageRoot) return;
    const encryptionKey = await requireEncryptionKey(req, res);
    if (!encryptionKey) return;
    const attachmentId = randomUUID();
    const storageKey = buildStorageKey(caseId, attachmentId, file.originalname);
    const { filePath } = resolveStoragePath(storageRoot, storageKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, encryptAttachment(file.buffer, encryptionKey));

    try {
      const created = await jhaService.addHazardAttachment(caseId, hazardId, {
        originalName: file.originalname,
        mimeType: file.mimetype,
        byteSize: file.size,
        storageKey
      });
      if (!created) {
        await fs.unlink(filePath).catch(() => undefined);
        return res.status(404).json({ error: "Not found" });
      }
      res.status(201).json({
        ...created,
        url: `/api/jha-cases/${caseId}/attachments/${created.id}/download`
      });
    } catch (error) {
      await fs.unlink(filePath).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error("[jhaAttachmentsRouter] upload hazard attachment", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

jhaAttachmentsRouter.put("/:attachmentId", async (req: Request, res: Response) => {
  try {
    const caseId = requireCaseId(req, res);
    if (!caseId) return;
    const attachmentId = req.params.attachmentId;
    if (!attachmentId) {
      return res.status(400).json({ error: "attachmentId parameter is required" });
    }

    const body = typeof req.body === "object" && req.body ? req.body : {};
    const stepIdRaw = (body as any).stepId;
    const hazardIdRaw = (body as any).hazardId;

    const patch: { stepId?: string | null; hazardId?: string | null } = {};
    if (stepIdRaw !== undefined) {
      if (typeof stepIdRaw === "string" || stepIdRaw === null) {
        patch.stepId = stepIdRaw;
      } else {
        return res.status(400).json({ error: "stepId must be a string or null" });
      }
    }
    if (hazardIdRaw !== undefined) {
      if (typeof hazardIdRaw === "string" || hazardIdRaw === null) {
        patch.hazardId = hazardIdRaw;
      } else {
        return res.status(400).json({ error: "hazardId must be a string or null" });
      }
    }

    const { jhaService } = getTenantServices(req);
    const updated = await jhaService.updateAttachment(caseId, attachmentId, patch);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({
      ...updated,
      url: `/api/jha-cases/${caseId}/attachments/${updated.id}/download`
    });
  } catch (error) {
    console.error("[jhaAttachmentsRouter] update attachment", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

jhaAttachmentsRouter.get("/:attachmentId", async (req: Request, res: Response) => {
  try {
    const caseId = requireCaseId(req, res);
    if (!caseId) return;
    const attachmentId = req.params.attachmentId;
    if (!attachmentId) {
      return res.status(400).json({ error: "attachmentId parameter is required" });
    }

    const { jhaService } = getTenantServices(req);
    const attachment = await jhaService.getAttachment(caseId, attachmentId);
    if (!attachment) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({
      ...attachment,
      url: `/api/jha-cases/${caseId}/attachments/${attachment.id}/download`
    });
  } catch (error) {
    console.error("[jhaAttachmentsRouter] get attachment", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

jhaAttachmentsRouter.get("/:attachmentId/download", async (req: Request, res: Response) => {
  try {
    const caseId = requireCaseId(req, res);
    if (!caseId) return;
    const attachmentId = req.params.attachmentId;
    if (!attachmentId) {
      return res.status(400).json({ error: "attachmentId parameter is required" });
    }

    const { jhaService } = getTenantServices(req);
    const storageRoot = requireStorageRoot(req, res);
    if (!storageRoot) return;
    const encryptionKey = await requireEncryptionKey(req, res);
    if (!encryptionKey) return;
    const attachment = await jhaService.getAttachment(caseId, attachmentId);
    if (!attachment) {
      return res.status(404).json({ error: "Not found" });
    }

    const { filePath } = resolveStoragePath(storageRoot, attachment.storageKey);
    const data = await fs.readFile(filePath);
    const decrypted = decryptAttachment(data, encryptionKey);
    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${safeFileComponent(attachment.originalName)}"`);
    res.send(decrypted);
  } catch (error) {
    console.error("[jhaAttachmentsRouter] download attachment", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

jhaAttachmentsRouter.delete("/:attachmentId", async (req: Request, res: Response) => {
  try {
    const caseId = requireCaseId(req, res);
    if (!caseId) return;
    const attachmentId = req.params.attachmentId;
    if (!attachmentId) {
      return res.status(400).json({ error: "attachmentId parameter is required" });
    }

    const { jhaService } = getTenantServices(req);
    const storageRoot = requireStorageRoot(req, res);
    if (!storageRoot) return;
    const deleted = await jhaService.deleteAttachment(caseId, attachmentId);
    if (!deleted) {
      return res.status(404).json({ error: "Not found" });
    }
    const { filePath } = resolveStoragePath(storageRoot, deleted.storageKey);
    await fs.unlink(filePath).catch(() => undefined);
    res.status(204).send();
  } catch (error) {
    console.error("[jhaAttachmentsRouter] delete attachment", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default jhaAttachmentsRouter;
