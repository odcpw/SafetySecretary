import { useEffect, useMemo, useRef, useState } from "react";
import { useRaContext } from "@/contexts/RaContext";
import type { RiskAssessmentCase } from "@/types/riskAssessment";
import { HAZARD_CATEGORIES } from "@/lib/hazardCategories";
import { TEMPLATE_LIKELIHOOD_OPTIONS, TEMPLATE_SEVERITY_OPTIONS } from "@/lib/templateRiskScales";

type TuiColumnKey =
  | "step"
  | "hazard"
  | "category"
  | "baselineSeverity"
  | "baselineLikelihood"
  | "residualSeverity"
  | "residualLikelihood";

type TuiColumnType = "readonly" | "text" | "select";

interface TuiColumn {
  key: TuiColumnKey;
  label: string;
  width: number;
  type: TuiColumnType;
}

const COLUMNS: TuiColumn[] = [
  { key: "step", label: "STEP", width: 6, type: "readonly" },
  { key: "hazard", label: "HAZARD", width: 34, type: "text" },
  { key: "category", label: "CAT", width: 10, type: "select" },
  { key: "baselineSeverity", label: "S", width: 6, type: "select" },
  { key: "baselineLikelihood", label: "L", width: 6, type: "select" },
  { key: "residualSeverity", label: "RS", width: 6, type: "select" },
  { key: "residualLikelihood", label: "RL", width: 6, type: "select" }
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const formatStepIndex = (index: number) => String(index).padStart(2, "0");

const displayValue = (value: string | null | undefined) => (value && value.trim() ? value : "—");

export const BrowserTuiSpreadsheetView = ({ raCase }: { raCase: RiskAssessmentCase }) => {
  const { saving, actions } = useRaContext();

  const rows = useMemo(() => {
    const stepNumberById = new Map(raCase.steps.map((step, index) => [step.id, index + 1]));
    const orderedHazards = [...raCase.hazards].sort((a, b) => {
      if (a.stepId !== b.stepId) {
        const aStep = stepNumberById.get(a.stepId) ?? 0;
        const bStep = stepNumberById.get(b.stepId) ?? 0;
        return aStep - bStep;
      }
      return a.orderIndex - b.orderIndex;
    });
    return orderedHazards.map((hazard) => {
      const stepIndex = stepNumberById.get(hazard.stepId) ?? 0;
      return {
        hazard,
        stepIndex
      };
    });
  }, [raCase.hazards, raCase.steps]);

  const [activeRow, setActiveRow] = useState(0);
  const [activeCol, setActiveCol] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const cellRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const activeKey = `${activeRow}:${activeCol}`;
  const activeColumn = COLUMNS[activeCol];
  const activeHazard = rows[activeRow]?.hazard ?? null;

  useEffect(() => {
    const el = cellRefs.current[activeKey];
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeKey]);

  useEffect(() => {
    setActiveRow((prev) => clamp(prev, 0, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  const beginEdit = () => {
    const column = COLUMNS[activeCol];
    const row = rows[activeRow];
    if (!column || !row || column.type === "readonly") {
      return;
    }
    setEditing(true);
    if (column.key === "hazard") {
      setEditValue(row.hazard.label);
      return;
    }
    if (column.key === "category") {
      setEditValue(row.hazard.categoryCode ?? "");
      return;
    }
    if (column.key === "baselineSeverity") {
      setEditValue(row.hazard.baseline?.severity ?? "");
      return;
    }
    if (column.key === "baselineLikelihood") {
      setEditValue(row.hazard.baseline?.likelihood ?? "");
      return;
    }
    if (column.key === "residualSeverity") {
      setEditValue(row.hazard.residual?.severity ?? "");
      return;
    }
    if (column.key === "residualLikelihood") {
      setEditValue(row.hazard.residual?.likelihood ?? "");
      return;
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditValue("");
  };

  const commitEdit = async () => {
    const column = COLUMNS[activeCol];
    const row = rows[activeRow];
    if (!column || !row) {
      cancelEdit();
      return;
    }
    const hazard = row.hazard;

    try {
      if (column.key === "hazard") {
        const next = editValue.trim();
        if (next && next !== hazard.label) {
          await actions.updateHazard(hazard.id, { label: next });
        }
      } else if (column.key === "category") {
        const next = editValue.trim();
        if (next && next !== (hazard.categoryCode ?? "")) {
          await actions.updateHazard(hazard.id, { categoryCode: next });
        }
      } else if (column.key === "baselineSeverity" || column.key === "baselineLikelihood") {
        const severity =
          column.key === "baselineSeverity" ? editValue : hazard.baseline?.severity ?? "";
        const likelihood =
          column.key === "baselineLikelihood" ? editValue : hazard.baseline?.likelihood ?? "";
        if (severity && likelihood) {
          await actions.saveRiskRatings([{ hazardId: hazard.id, severity, likelihood }]);
        }
      } else if (column.key === "residualSeverity" || column.key === "residualLikelihood") {
        const severity =
          column.key === "residualSeverity" ? editValue : hazard.residual?.severity ?? "";
        const likelihood =
          column.key === "residualLikelihood" ? editValue : hazard.residual?.likelihood ?? "";
        if (severity && likelihood) {
          await actions.saveResidualRisk([{ hazardId: hazard.id, severity, likelihood }]);
        }
      }
    } finally {
      cancelEdit();
    }
  };

  const handleGridKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (editing) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveRow((prev) => clamp(prev + 1, 0, Math.max(0, rows.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveRow((prev) => clamp(prev - 1, 0, Math.max(0, rows.length - 1)));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveCol((prev) => clamp(prev - 1, 0, COLUMNS.length - 1));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setActiveCol((prev) => clamp(prev + 1, 0, COLUMNS.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      beginEdit();
    }
  };

  const renderCellText = (rowIndex: number, column: TuiColumn) => {
    const hazard = rows[rowIndex]!.hazard;
    if (column.key === "step") {
      return formatStepIndex(rows[rowIndex]!.stepIndex);
    }
    if (column.key === "hazard") {
      return displayValue(hazard.label);
    }
    if (column.key === "category") {
      return displayValue(hazard.categoryCode);
    }
    if (column.key === "baselineSeverity") {
      return displayValue(hazard.baseline?.severity);
    }
    if (column.key === "baselineLikelihood") {
      return displayValue(hazard.baseline?.likelihood);
    }
    if (column.key === "residualSeverity") {
      return displayValue(hazard.residual?.severity);
    }
    if (column.key === "residualLikelihood") {
      return displayValue(hazard.residual?.likelihood);
    }
    return "—";
  };

  const renderEditor = (rowIndex: number, column: TuiColumn) => {
    if (!editing || rowIndex !== activeRow || COLUMNS[activeCol]?.key !== column.key) {
      return null;
    }

    const hazard = rows[rowIndex]!.hazard;
    const onKeyDown: React.KeyboardEventHandler<HTMLElement> = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelEdit();
      } else if (event.key === "Enter" && column.type === "text") {
        event.preventDefault();
        void commitEdit();
      }
    };

    if (column.key === "hazard") {
      return (
        <input
          className="tui-input"
          value={editValue}
          onChange={(event) => setEditValue(event.target.value)}
          onBlur={() => void commitEdit()}
          onKeyDown={onKeyDown}
          disabled={saving}
          autoFocus
        />
      );
    }

    const options =
      column.key === "category"
        ? HAZARD_CATEGORIES.map((cat) => ({ value: cat.code, label: cat.code }))
        : column.key === "baselineSeverity" || column.key === "residualSeverity"
          ? TEMPLATE_SEVERITY_OPTIONS.map((opt) => ({ value: opt.value, label: opt.value }))
          : TEMPLATE_LIKELIHOOD_OPTIONS.map((opt) => ({ value: opt.value, label: opt.value }));

    return (
      <select
        className="tui-select"
        value={editValue}
        onChange={(event) => setEditValue(event.target.value)}
        onBlur={() => void commitEdit()}
        onKeyDown={onKeyDown}
        disabled={saving}
        autoFocus
      >
        <option value="">{hazard ? "—" : "—"}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  };

  if (!rows.length) {
    return (
      <section className="tui-panel">
        <header className="tui-panel__header">
          <h3>Browser TUI (prototype)</h3>
          <p>Arrow keys to navigate, Enter to edit.</p>
        </header>
        <div className="tui-empty">No hazards yet. Add hazards first.</div>
      </section>
    );
  }

  return (
    <section className="tui-panel">
      <header className="tui-panel__header">
        <h3>Browser TUI (prototype)</h3>
        <p>Arrow keys to navigate, Enter to edit, Esc to cancel.</p>
      </header>
      <div className="tui-grid" role="grid" tabIndex={0} onKeyDown={handleGridKeyDown}>
        <div className="tui-row tui-row--header" role="row">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              className="tui-cell tui-cell--header"
              role="columnheader"
              style={{ width: `${col.width}ch` }}
            >
              {col.label}
            </div>
          ))}
        </div>
        {rows.map((_, rowIndex) => (
          <div key={rows[rowIndex]!.hazard.id} className="tui-row" role="row">
            {COLUMNS.map((col, colIndex) => {
              const key = `${rowIndex}:${colIndex}`;
              const active = rowIndex === activeRow && colIndex === activeCol;
              return (
                <div
                  key={col.key}
                  ref={(el) => {
                    cellRefs.current[key] = el;
                  }}
                  role="gridcell"
                  tabIndex={active ? 0 : -1}
                  className={active ? "tui-cell tui-cell--active" : "tui-cell"}
                  style={{ width: `${col.width}ch` }}
                  onClick={() => {
                    setActiveRow(rowIndex);
                    setActiveCol(colIndex);
                  }}
                  onDoubleClick={() => beginEdit()}
                >
                  <span className="tui-text">{renderCellText(rowIndex, col)}</span>
                  {renderEditor(rowIndex, col)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <footer className="tui-status">
        <span>
          Row {activeRow + 1}/{rows.length} · Col {activeColumn?.label ?? "—"}
          {activeHazard ? ` · ${activeHazard.label}` : ""}
        </span>
        <span>{saving ? "Saving…" : editing ? "Editing…" : "Ready"}</span>
      </footer>
    </section>
  );
};
