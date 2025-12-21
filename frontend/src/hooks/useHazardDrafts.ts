import { useEffect, useMemo, useState } from "react";
import type { Hazard } from "@/types/riskAssessment";

export interface HazardDraftFields {
  label: string;
  description: string;
  existingControls: string;
}

const buildDrafts = (hazards: Hazard[]) =>
  hazards.reduce<Record<string, HazardDraftFields>>((acc, hazard) => {
    acc[hazard.id] = {
      label: hazard.label,
      description: hazard.description ?? "",
      existingControls: (hazard.existingControls ?? []).join("\n")
    };
    return acc;
  }, {});

const normalizeDraft = (draft: HazardDraftFields) => ({
  label: draft.label.trim(),
  description: draft.description.trim(),
  existingControls: draft.existingControls.trim()
});

const normalizeHazard = (hazard: Hazard) => ({
  label: hazard.label.trim(),
  description: (hazard.description ?? "").trim(),
  existingControls: (hazard.existingControls ?? []).join("\n").trim()
});

export const useHazardDrafts = (hazards: Hazard[]) => {
  const hazardById = useMemo(() => new Map(hazards.map((hazard) => [hazard.id, hazard])), [hazards]);
  const [drafts, setDrafts] = useState<Record<string, HazardDraftFields>>(() => buildDrafts(hazards));

  useEffect(() => {
    const handle = requestAnimationFrame(() => setDrafts(buildDrafts(hazards)));
    return () => cancelAnimationFrame(handle);
  }, [hazards]);

  const patchDraft = (hazardId: string, patch: Partial<HazardDraftFields>) => {
    setDrafts((prev) => ({
      ...prev,
      [hazardId]: {
        ...(prev[hazardId] ?? { label: "", description: "", existingControls: "" }),
        ...patch
      }
    }));
  };

  const commitDraft = async (
    hazardId: string,
    onUpdateHazard: (hazardId: string, patch: { label?: string; description?: string; existingControls?: string[] }) => Promise<void>
  ) => {
    const hazard = hazardById.get(hazardId);
    const draft = drafts[hazardId];
    if (!hazard || !draft) {
      return false;
    }

    const normalizedDraft = normalizeDraft(draft);
    const normalizedHazard = normalizeHazard(hazard);
    if (
      normalizedDraft.label === normalizedHazard.label &&
      normalizedDraft.description === normalizedHazard.description &&
      normalizedDraft.existingControls === normalizedHazard.existingControls
    ) {
      return false;
    }

    const patch: { label?: string; description?: string; existingControls?: string[] } = {};
    if (normalizedDraft.label !== normalizedHazard.label) {
      patch.label = draft.label;
    }
    if (normalizedDraft.description !== normalizedHazard.description) {
      patch.description = draft.description;
    }
    if (normalizedDraft.existingControls !== normalizedHazard.existingControls) {
      patch.existingControls = normalizedDraft.existingControls
        ? normalizedDraft.existingControls
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
        : [];
    }

    if (!Object.keys(patch).length) {
      return false;
    }

    await onUpdateHazard(hazardId, patch);
    return true;
  };

  return {
    drafts,
    patchDraft,
    commitDraft
  };
};
