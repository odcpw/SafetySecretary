import type { ReactNode } from "react";

type StepState = "current" | "done" | "pending";

export interface TuiStep {
  id: string;
  label: string;
  state: StepState;
}

interface TuiStepperProps {
  steps: TuiStep[];
  onSelect?: (id: string) => void;
  actions?: ReactNode;
}

export const TuiStepper = ({ steps, onSelect, actions }: TuiStepperProps) => (
  <div className="tui-stepper" box-="square">
    <div className="tui-stepper__steps">
      {steps.map((step) => (
        <button
          key={step.id}
          type="button"
          className={`tui-step tui-step--${step.state}`}
          onClick={() => onSelect?.(step.id)}
        >
          {step.label}
        </button>
      ))}
    </div>
    {actions && <div className="tui-stepper__actions">{actions}</div>}
  </div>
);
