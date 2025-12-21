import { Router, Request, Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { env } from "../config/env";
import { AppLocals } from "../types/app";
import { decryptAttachment, encryptAttachment } from "../services/attachmentCrypto";
import { resolveStoragePath } from "../services/storagePaths";

const attachmentsRouter = Router({ mergeParams: true });

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
  return path.posix.join(caseId, `${attachmentId}-${safeName}`);
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

attachmentsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const caseId = requireCaseId(req, res);
    if (!caseId) return;

    const { raService } = getTenantServices(req);
    const attachments = await raService.listAttachments(caseId);
    res.json(
      attachments.map((attachment) => ({
        ...attachment,
        url: `/api/ra-cases/${caseId}/attachments/${attachment.id}/download`
      }))
    );
  } catch (error) {
    console.error("[attachmentsRouter] list attachments", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

attachmentsRouter.post("/steps/:stepId", upload.single("file"), async (req: Request, res: Response) => {
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

    const { raService } = getTenantServices(req);
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
      const created = await raService.addStepAttachment(caseId, stepId, {
        originalName: file.originalname,
        mimeType: file.mimetype,
        byteSize: file.size,
        storageKey
      });
      if (!created) {
        await fs.unlink(filePath).catch(() => undefined);
        return res.status(404).json({ error: "Not found" });
      }
      res.status(201).json({ ...created, url: `/api/ra-cases/${caseId}/attachments/${created.id}/download` });
    } catch (error) {
      await fs.unlink(filePath).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error("[attachmentsRouter] upload step attachment", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

attachmentsRouter.put("/steps/:stepId/order", async (req: Request, res: Response) => {
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

    const { raService } = getTenantServices(req);
    const ok = await raService.reorderStepAttachments(caseId, stepId, attachmentIdsRaw);
    if (!ok) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("[attachmentsRouter] reorder step attachments", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

attachmentsRouter.post("/hazards/:hazardId", upload.single("file"), async (req: Request, res: Response) => {
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

    const { raService } = getTenantServices(req);
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
      const created = await raService.addHazardAttachment(caseId, hazardId, {
        originalName: file.originalname,
        mimeType: file.mimetype,
        byteSize: file.size,
        storageKey
      });
      if (!created) {
        await fs.unlink(filePath).catch(() => undefined);
        return res.status(404).json({ error: "Not found" });
      }
      res.status(201).json({ ...created, url: `/api/ra-cases/${caseId}/attachments/${created.id}/download` });
    } catch (error) {
      await fs.unlink(filePath).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error("[attachmentsRouter] upload hazard attachment", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

attachmentsRouter.put("/:attachmentId", async (req: Request, res: Response) => {
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

    const { raService } = getTenantServices(req);
    const updated = await raService.updateAttachment(caseId, attachmentId, patch);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ ...updated, url: `/api/ra-cases/${caseId}/attachments/${updated.id}/download` });
  } catch (error) {
    console.error("[attachmentsRouter] update attachment", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

attachmentsRouter.get("/:attachmentId", async (req: Request, res: Response) => {
  try {
    const caseId = requireCaseId(req, res);
    if (!caseId) return;
    const attachmentId = req.params.attachmentId;
    if (!attachmentId) {
      return res.status(400).json({ error: "attachmentId parameter is required" });
    }

    const { raService } = getTenantServices(req);
    const attachment = await raService.getAttachment(caseId, attachmentId);
    if (!attachment) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ ...attachment, url: `/api/ra-cases/${caseId}/attachments/${attachment.id}/download` });
  } catch (error) {
    console.error("[attachmentsRouter] get attachment", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

attachmentsRouter.get("/:attachmentId/download", async (req: Request, res: Response) => {
  try {
    const caseId = requireCaseId(req, res);
    if (!caseId) return;
    const attachmentId = req.params.attachmentId;
    if (!attachmentId) {
      return res.status(400).json({ error: "attachmentId parameter is required" });
    }

    const { raService } = getTenantServices(req);
    const storageRoot = requireStorageRoot(req, res);
    if (!storageRoot) return;
    const encryptionKey = await requireEncryptionKey(req, res);
    if (!encryptionKey) return;
    const attachment = await raService.getAttachment(caseId, attachmentId);
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
    console.error("[attachmentsRouter] download attachment", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

attachmentsRouter.delete("/:attachmentId", async (req: Request, res: Response) => {
  try {
    const caseId = requireCaseId(req, res);
    if (!caseId) return;
    const attachmentId = req.params.attachmentId;
    if (!attachmentId) {
      return res.status(400).json({ error: "attachmentId parameter is required" });
    }

    const { raService } = getTenantServices(req);
    const storageRoot = requireStorageRoot(req, res);
    if (!storageRoot) return;
    const deleted = await raService.deleteAttachment(caseId, attachmentId);
    if (!deleted) {
      return res.status(404).json({ error: "Not found" });
    }
    const { filePath } = resolveStoragePath(storageRoot, deleted.storageKey);
    await fs.unlink(filePath).catch(() => undefined);
    res.status(204).send();
  } catch (error) {
    console.error("[attachmentsRouter] delete attachment", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default attachmentsRouter;
