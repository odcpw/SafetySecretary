import type { ReactNode } from "react";
import { useRef, useState } from "react";

interface OverflowMenuProps {
  label: string;
  children: ReactNode;
}

export const OverflowMenu = ({ label, children }: OverflowMenuProps) => {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  const handlePanelClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest(".overflow-menu__item")) {
      detailsRef.current?.removeAttribute("open");
      setOpen(false);
    }
  };

  return (
    <details
      className="overflow-menu"
      ref={detailsRef}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary
        className="btn-outline btn-small overflow-menu__summary"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </summary>
      <div className="overflow-menu__panel" role="menu" aria-label={label} onClick={handlePanelClick}>
        {children}
      </div>
    </details>
  );
};
