import { useEffect, useMemo, useState } from "react";
import type { RiskAssessmentCase } from "@/types/riskAssessment";
import {
  buildDefaultMatrixLabels,
  getDefaultMatrixSettings,
  loadMatrixSettings,
  persistMatrixSettings,
  projectAssessmentToCell,
  type RiskMatrixSettings
} from "@/lib/riskMatrixSettings";
import { useI18n } from "@/i18n/I18nContext";

type Mode = "current" | "residual";

export const RiskMatrixPanel = ({ raCase }: { raCase: RiskAssessmentCase }) => {
  const { t } = useI18n();
  const defaultLabels = useMemo(() => buildDefaultMatrixLabels(t), [t]);
  const [mode, setMode] = useState<Mode>("current");
  const [selectedCell, setSelectedCell] = useState<{ row: number; column: number } | null>(null);
  const [settings, setSettings] = useState<RiskMatrixSettings>(() => loadMatrixSettings(defaultLabels));
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    persistMatrixSettings(settings);
  }, [settings]);

  useEffect(() => {
    setSettings(loadMatrixSettings(defaultLabels));
  }, [defaultLabels]);

  const rowLabels = useMemo(() => {
    const labels = [...settings.rowLabels];
    while (labels.length < settings.rows) {
      labels.push(t("ra.matrix.rowFallback", { values: { index: labels.length + 1 } }));
    }
    return labels.slice(0, settings.rows);
  }, [settings.rowLabels, settings.rows]);

  const columnLabels = useMemo(() => {
    const labels = [...settings.columnLabels];
    while (labels.length < settings.columns) {
      labels.push(t("ra.matrix.columnFallback", { values: { index: labels.length + 1 } }));
    }
    return labels.slice(0, settings.columns);
  }, [settings.columnLabels, settings.columns]);

  const matrix = useMemo(() => {
    const rows = Array.from({ length: settings.rows }, () =>
      Array.from({ length: settings.columns }, () => [] as RiskAssessmentCase["hazards"])
    );

    raCase.hazards.forEach((hazard) => {
      const assessment = mode === "current" ? hazard.baseline : hazard.residual;
      const cell = projectAssessmentToCell(assessment?.severity, assessment?.likelihood, settings);
      if (!cell) return;
      rows[cell.row]![cell.column]!.push(hazard);
    });

    return rows;
  }, [mode, raCase.hazards, settings]);

  const hazardsInSelectedCell =
    selectedCell && matrix[selectedCell.row]?.[selectedCell.column]
      ? matrix[selectedCell.row]![selectedCell.column]!
      : [];

  const getCellColor = (row: number, col: number) => {
    const bucketCount = settings.riskBuckets.length;
    if (!bucketCount) {
      return "#cbd5f5";
    }
    const normalizedRow = settings.rows > 1 ? row / (settings.rows - 1) : 0;
    const normalizedCol = settings.columns > 1 ? col / (settings.columns - 1) : 0;
    const normalized = (normalizedRow + normalizedCol) / 2;
    const bucketIndex = Math.min(
      bucketCount - 1,
      Math.max(0, Math.round(normalized * (bucketCount - 1)))
    );
    return settings.riskBuckets[bucketIndex]?.color ?? "#cbd5f5";
  };

  const updateRowCount = (count: number) => {
    const safe = Math.max(2, Math.min(7, Number.isFinite(count) ? count : settings.rows));
    setSettings((prev) => ({
      ...prev,
      rows: safe,
      rowLabels: prev.rowLabels.slice(0, safe)
    }));
    setSelectedCell(null);
  };

  const updateColCount = (count: number) => {
    const safe = Math.max(2, Math.min(7, Number.isFinite(count) ? count : settings.columns));
    setSettings((prev) => ({
      ...prev,
      columns: safe,
      columnLabels: prev.columnLabels.slice(0, safe)
    }));
    setSelectedCell(null);
  };

  const resetSettings = () => {
    const defaults = getDefaultMatrixSettings(defaultLabels);
    setSettings(defaults);
    setSelectedCell(null);
  };

  const rowEntries = rowLabels.map((label, rowIndex) => ({ label, rowIndex }));

  return (
    <div className="risk-matrix-panel">
      <div className="risk-matrix-toolbar">
        <div className="risk-matrix-mode">
          <button
            type="button"
            className={mode === "current" ? "btn-outline active" : "btn-outline"}
            onClick={() => {
              setMode("current");
              setSelectedCell(null);
            }}
          >
            {t("ra.matrix.current")}
          </button>
          <button
            type="button"
            className={mode === "residual" ? "btn-outline active" : "btn-outline"}
            onClick={() => {
              setMode("residual");
              setSelectedCell(null);
            }}
          >
            {t("ra.matrix.residual")}
          </button>
        </div>
        <div className="risk-matrix-toolbar__actions">
          <button type="button" className="btn-ghost" onClick={() => setShowSettings((prev) => !prev)}>
            {showSettings ? t("ra.matrix.hideSettings") : t("ra.matrix.customize")}
          </button>
          <button type="button" className="btn-outline" onClick={resetSettings}>
            {t("ra.matrix.resetDefaults")}
          </button>
        </div>
      </div>

      {showSettings && (
        <section className="risk-matrix-settings">
          <div className="settings-group">
            <label>{t("ra.matrix.rowsLabel")}</label>
            <input
              type="number"
              min={2}
              max={7}
              value={settings.rows}
              onChange={(event) => updateRowCount(Number(event.target.value))}
            />
            <div className="settings-list">
              {rowLabels.map((label, index) => (
                <input
                  key={`row-${index}`}
                  value={label}
                  onChange={(event) =>
                    setSettings((prev) => {
                      const next = [...rowLabels];
                      next[index] = event.target.value;
                      return { ...prev, rowLabels: next };
                    })
                  }
                />
              ))}
            </div>
          </div>

          <div className="settings-group">
            <label>{t("ra.matrix.columnsLabel")}</label>
            <input
              type="number"
              min={2}
              max={7}
              value={settings.columns}
              onChange={(event) => updateColCount(Number(event.target.value))}
            />
            <div className="settings-list">
              {columnLabels.map((label, index) => (
                <input
                  key={`col-${index}`}
                  value={label}
                  onChange={(event) =>
                    setSettings((prev) => {
                      const next = [...columnLabels];
                      next[index] = event.target.value;
                      return { ...prev, columnLabels: next };
                    })
                  }
                />
              ))}
            </div>
          </div>

          <div className="settings-group">
            <label>{t("ra.matrix.colorsLabel")}</label>
            <div className="risk-colors">
              {settings.riskBuckets.map((bucket, index) => (
                <div key={`bucket-${index}`} className="risk-color-item">
                  <input
                    type="color"
                    value={bucket.color}
                    onChange={(event) =>
                      setSettings((prev) => {
                        const next = [...prev.riskBuckets];
                        next[index] = { ...next[index]!, color: event.target.value };
                        return { ...prev, riskBuckets: next };
                      })
                    }
                  />
                  <input
                    value={bucket.label}
                    onChange={(event) =>
                      setSettings((prev) => {
                        const next = [...prev.riskBuckets];
                        next[index] = { ...next[index]!, label: event.target.value };
                        return { ...prev, riskBuckets: next };
                      })
                    }
                    placeholder={t("ra.matrix.labelPlaceholder")}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="risk-matrix-grid-wrapper">
        <table className="risk-matrix-grid">
          <thead>
            <tr>
              <th>{t("ra.matrix.axisHeader")}</th>
              {columnLabels.map((label, colIndex) => (
                <th key={`col-${colIndex}`}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowEntries
              .slice()
              .reverse()
              .map(({ label, rowIndex }) => (
                <tr key={`row-${rowIndex}`}>
                  <td>{label}</td>
                {columnLabels.map((_, colIndex) => {
                  const count = matrix[rowIndex]?.[colIndex]?.length ?? 0;
                  const isSelected =
                    selectedCell?.row === rowIndex && selectedCell?.column === colIndex;
                  return (
                    <td key={`cell-${rowIndex}-${colIndex}`}>
                      <button
                        type="button"
                        className={`risk-cell ${isSelected ? "selected" : ""}`}
                        style={{ backgroundColor: getCellColor(rowIndex, colIndex) }}
                        onClick={() =>
                          setSelectedCell((prev) =>
                            prev && prev.row === rowIndex && prev.column === colIndex
                              ? null
                              : { row: rowIndex, column: colIndex }
                          )
                        }
                      >
                        <span className="risk-cell-count">{count}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
              ))}
          </tbody>
        </table>
      </div>

      {selectedCell && (
        <div className="risk-matrix-details">
          <h4>
            {rowLabels[selectedCell.row]} × {columnLabels[selectedCell.column]}
          </h4>
          {hazardsInSelectedCell.length === 0 ? (
            <p>No hazards plotted here yet.</p>
          ) : (
            <ul>
              {hazardsInSelectedCell.map((hazard) => (
                <li key={hazard.id}>
                  <strong>{hazard.label}</strong>
                  <span>
                    {raCase.steps.find((step) => step.id === hazard.stepId)?.activity ?? "Unassigned"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
