import type { Phase, RiskAssessmentCase } from "@/types/riskAssessment";

interface PhaseReviewPlaceholderProps {
  phase: Phase;
  raCase: RiskAssessmentCase;
  canAdvance?: boolean;
  onNext: () => Promise<void>;
}

const COPY: Record<
  "SIGN_OFF" | "COMPLETE",
  { title: string; body: string; actionLabel: string | null }
> = {
  SIGN_OFF: {
    title: "Review & share the latest cut",
    body: "Use this space to pause, export, and gather signatures. You can always jump back to any phase to keep iterating—cases stay editable forever.",
    actionLabel: "Mark this version as shared"
  },
  COMPLETE: {
    title: "Living document snapshot",
    body: "This workspace treats every case as a living document. Switch phases to edit, then export or duplicate as needed to capture new revisions.",
    actionLabel: null
  }
};

export const PhaseReviewPlaceholder = ({
  phase,
  raCase,
  canAdvance = false,
  onNext
}: PhaseReviewPlaceholderProps) => {
  const copy = COPY[phase === "COMPLETE" ? "COMPLETE" : "SIGN_OFF"];
  const latestEdit = new Date(raCase.createdAt).toLocaleString();
  const stats = [
    { label: "Process steps", value: raCase.steps.length },
    { label: "Hazards", value: raCase.hazards.length },
    { label: "Actions", value: raCase.actions.length }
  ];

  return (
    <section className="phase-review app-panel">
      <header className="phase-review__header">
        <p className="text-label">Living document</p>
        <h3>{copy.title}</h3>
        <p>{copy.body}</p>
      </header>

      <dl className="phase-review__stats">
        {stats.map((stat) => (
          <div key={stat.label} className="phase-review__stat">
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="phase-review__note">
        Latest version captured: <strong>{latestEdit}</strong>. Use the phase chips below to move backwards or forwards;
        nothing locks when you advance.
      </div>

      {canAdvance && copy.actionLabel && (
        <button type="button" className="phase-review__action" onClick={() => onNext()}>
          {copy.actionLabel}
        </button>
      )}
    </section>
  );
};
