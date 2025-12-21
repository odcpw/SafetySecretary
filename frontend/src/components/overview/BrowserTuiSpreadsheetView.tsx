import { useEffect, useMemo, useRef, useState } from "react";
import { useRaContext } from "@/contexts/RaContext";
import type { RiskAssessmentCase } from "@/types/riskAssessment";
import { HAZARD_CATEGORIES } from "@/lib/hazardCategories";
import { TEMPLATE_LIKELIHOOD_OPTIONS, TEMPLATE_SEVERITY_OPTIONS } from "@/lib/templateRiskScales";
import { useI18n } from "@/i18n/I18nContext";

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

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const formatStepIndex = (index: number) => String(index).padStart(2, "0");

export const BrowserTuiSpreadsheetView = ({ raCase }: { raCase: RiskAssessmentCase }) => {
  const { saving, actions } = useRaContext();
  const { t } = useI18n();

  const columns = useMemo<TuiColumn[]>(
    () => [
      { key: "step", label: t("tui.columns.step"), width: 6, type: "readonly" },
      { key: "hazard", label: t("tui.columns.hazard"), width: 34, type: "text" },
      { key: "category", label: t("tui.columns.category"), width: 12, type: "select" },
      { key: "baselineSeverity", label: t("tui.columns.baselineSeverity"), width: 6, type: "select" },
      { key: "baselineLikelihood", label: t("tui.columns.baselineLikelihood"), width: 6, type: "select" },
      { key: "residualSeverity", label: t("tui.columns.residualSeverity"), width: 6, type: "select" },
      { key: "residualLikelihood", label: t("tui.columns.residualLikelihood"), width: 6, type: "select" }
    ],
    [t]
  );

  const displayValue = (value: string | null | undefined) =>
    value && value.trim() ? value : t("common.noData");

  const [baselineDraft, setBaselineDraft] = useState<Record<string, { severity: string; likelihood: string }>>(() =>
    raCase.hazards.reduce<Record<string, { severity: string; likelihood: string }>>((acc, hazard) => {
      acc[hazard.id] = {
        severity: hazard.baseline?.severity ?? "",
        likelihood: hazard.baseline?.likelihood ?? ""
      };
      return acc;
    }, {})
  );

  const [residualDraft, setResidualDraft] = useState<Record<string, { severity: string; likelihood: string }>>(() =>
    raCase.hazards.reduce<Record<string, { severity: string; likelihood: string }>>((acc, hazard) => {
      acc[hazard.id] = {
        severity: hazard.residual?.severity ?? "",
        likelihood: hazard.residual?.likelihood ?? ""
      };
      return acc;
    }, {})
  );

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
  const activeColumn = columns[activeCol];
  const activeHazard = rows[activeRow]?.hazard ?? null;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setBaselineDraft(
      raCase.hazards.reduce<Record<string, { severity: string; likelihood: string }>>((acc, hazard) => {
        acc[hazard.id] = {
          severity: hazard.baseline?.severity ?? "",
          likelihood: hazard.baseline?.likelihood ?? ""
        };
        return acc;
      }, {})
    );
    setResidualDraft(
      raCase.hazards.reduce<Record<string, { severity: string; likelihood: string }>>((acc, hazard) => {
        acc[hazard.id] = {
          severity: hazard.residual?.severity ?? "",
          likelihood: hazard.residual?.likelihood ?? ""
        };
        return acc;
      }, {})
    );
  }, [raCase]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    const column = columns[activeCol];
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
      setEditValue(baselineDraft[row.hazard.id]?.severity ?? row.hazard.baseline?.severity ?? "");
      return;
    }
    if (column.key === "baselineLikelihood") {
      setEditValue(baselineDraft[row.hazard.id]?.likelihood ?? row.hazard.baseline?.likelihood ?? "");
      return;
    }
    if (column.key === "residualSeverity") {
      setEditValue(residualDraft[row.hazard.id]?.severity ?? row.hazard.residual?.severity ?? "");
      return;
    }
    if (column.key === "residualLikelihood") {
      setEditValue(residualDraft[row.hazard.id]?.likelihood ?? row.hazard.residual?.likelihood ?? "");
      return;
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditValue("");
  };

  const commitEdit = async () => {
    const column = columns[activeCol];
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
        const current = baselineDraft[hazard.id] ?? {
          severity: hazard.baseline?.severity ?? "",
          likelihood: hazard.baseline?.likelihood ?? ""
        };
        const next = {
          severity: column.key === "baselineSeverity" ? editValue : current.severity,
          likelihood: column.key === "baselineLikelihood" ? editValue : current.likelihood
        };
        setBaselineDraft((prev) => ({ ...prev, [hazard.id]: next }));
        const shouldSave =
          (next.severity && next.likelihood) || (!next.severity && !next.likelihood);
        if (shouldSave) {
          await actions.saveRiskRatings([
            { hazardId: hazard.id, severity: next.severity ?? "", likelihood: next.likelihood ?? "" }
          ]);
        }
      } else if (column.key === "residualSeverity" || column.key === "residualLikelihood") {
        const current = residualDraft[hazard.id] ?? {
          severity: hazard.residual?.severity ?? "",
          likelihood: hazard.residual?.likelihood ?? ""
        };
        const next = {
          severity: column.key === "residualSeverity" ? editValue : current.severity,
          likelihood: column.key === "residualLikelihood" ? editValue : current.likelihood
        };
        setResidualDraft((prev) => ({ ...prev, [hazard.id]: next }));
        const shouldSave =
          (next.severity && next.likelihood) || (!next.severity && !next.likelihood);
        if (shouldSave) {
          await actions.saveResidualRisk([
            { hazardId: hazard.id, severity: next.severity ?? "", likelihood: next.likelihood ?? "" }
          ]);
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
      setActiveCol((prev) => clamp(prev - 1, 0, columns.length - 1));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setActiveCol((prev) => clamp(prev + 1, 0, columns.length - 1));
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
      const label = hazard.categoryCode
        ? t(`domain.hazardCategories.${hazard.categoryCode}`, { fallback: hazard.categoryCode })
        : "";
      return displayValue(label);
    }
    if (column.key === "baselineSeverity") {
      return displayValue(baselineDraft[hazard.id]?.severity ?? hazard.baseline?.severity);
    }
    if (column.key === "baselineLikelihood") {
      return displayValue(baselineDraft[hazard.id]?.likelihood ?? hazard.baseline?.likelihood);
    }
    if (column.key === "residualSeverity") {
      return displayValue(residualDraft[hazard.id]?.severity ?? hazard.residual?.severity);
    }
    if (column.key === "residualLikelihood") {
      return displayValue(residualDraft[hazard.id]?.likelihood ?? hazard.residual?.likelihood);
    }
    return t("common.noData");
  };

  const renderEditor = (rowIndex: number, column: TuiColumn) => {
    if (!editing || rowIndex !== activeRow || columns[activeCol]?.key !== column.key) {
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
        ? HAZARD_CATEGORIES.map((cat) => ({
          value: cat.code,
          label: t(`domain.hazardCategories.${cat.code}`, { fallback: cat.label ?? cat.code })
        }))
        : column.key === "baselineSeverity" || column.key === "residualSeverity"
          ? TEMPLATE_SEVERITY_OPTIONS.map((opt) => ({
            value: opt.value,
            label: t(`domain.severity.${opt.value}`, { fallback: opt.label })
          }))
          : TEMPLATE_LIKELIHOOD_OPTIONS.map((opt) => ({
            value: opt.value,
            label: t(`domain.likelihood.${opt.value}`, { fallback: opt.label })
          }));

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
        <option value="">{t("common.noData")}</option>
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
          <h3>{t("tui.title")}</h3>
          <p>{t("tui.instructionsShort")}</p>
        </header>
        <div className="tui-empty">{t("tui.empty")}</div>
      </section>
    );
  }

  return (
    <section className="tui-panel">
      <header className="tui-panel__header">
        <h3>{t("tui.title")}</h3>
        <p>{t("tui.instructions")}</p>
      </header>
      <div className="tui-grid" role="grid" tabIndex={0} onKeyDown={handleGridKeyDown}>
        <div className="tui-row tui-row--header" role="row">
          {columns.map((col) => (
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
            {columns.map((col, colIndex) => {
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
          {t("tui.status", {
            values: {
              row: activeRow + 1,
              total: rows.length,
              column: activeColumn?.label ?? t("common.noData"),
              hazard: activeHazard ? ` · ${activeHazard.label}` : ""
            }
          })}
        </span>
        <span>
          {saving ? t("tui.saving") : editing ? t("tui.editing") : t("tui.ready")}
        </span>
      </footer>
    </section>
  );
};
