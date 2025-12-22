import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "default" | "danger";
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

export const useConfirmDialog = () => {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolverRef = useRef<(value: boolean) => void>();

  const confirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ ...options, open: true });
    });

  const handleClose = () => {
    resolverRef.current?.(false);
    resolverRef.current = undefined;
    setState(null);
  };

  const handleConfirm = () => {
    resolverRef.current?.(true);
    resolverRef.current = undefined;
    setState(null);
  };

  const dialog: ReactNode = state ? (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      tone={state.tone}
      onConfirm={handleConfirm}
      onClose={handleClose}
    />
  ) : null;

  return { confirm, dialog };
};
