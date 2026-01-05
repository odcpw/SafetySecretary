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
import { buildHazardNumberMap } from "@/lib/hazardNumbering";
import { useI18n } from "@/i18n/I18nContext";

// SUVA color scheme
const SUVA_BLUE = "#2563EB";
const SUVA_YELLOW = "#EAB308";
const SUVA_RED = "#DC2626";

// SUVA risk zone pattern (5x5 matrix)
// Columns: V, IV, III, II, I (left to right)
// Rows: A, B, C, D, E (top to bottom, A=Frequent, E=Rare)
const SUVA_ZONE_PATTERN: string[][] = [
  [SUVA_YELLOW, SUVA_YELLOW, SUVA_RED, SUVA_RED, SUVA_RED],    // Row A: Y Y R R R
  [SUVA_BLUE, SUVA_YELLOW, SUVA_RED, SUVA_RED, SUVA_RED],      // Row B: B Y R R R
  [SUVA_BLUE, SUVA_YELLOW, SUVA_YELLOW, SUVA_RED, SUVA_RED],   // Row C: B Y Y R R
  [SUVA_BLUE, SUVA_YELLOW, SUVA_YELLOW, SUVA_YELLOW, SUVA_RED],// Row D: B Y Y Y R
  [SUVA_BLUE, SUVA_BLUE, SUVA_BLUE, SUVA_YELLOW, SUVA_YELLOW]  // Row E: B B B Y Y
];

type MatrixMode = "current" | "residual";

interface HazardEntry {
  label: string;
  stepId: string;
  hazardId: string;
  displayNumber: string;
}

interface MatrixCellData {
  hazardLabels: string[];
  hazardEntries: HazardEntry[];
}

// Aggregate hazard numbers - return comma-separated display numbers
function aggregateNumbers(entries: HazardEntry[]): string {
  return entries.map(e => e.displayNumber).join(", ");
}

export const RiskMatrixPanel = ({ raCase }: { raCase: RiskAssessmentCase }) => {
  const { t } = useI18n();
  const defaultLabels = useMemo(() => buildDefaultMatrixLabels(t), [t]);
  const [selectedCell, setSelectedCell] = useState<{ row: number; column: number; mode: MatrixMode } | null>(null);
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

  // Build a lookup from hazardId to display number
  const hazardNumberMap = useMemo(
    () => buildHazardNumberMap(raCase.steps, raCase.hazards),
    [raCase.steps, raCase.hazards]
  );

  // Build matrix data for both current and residual assessments
  const currentMatrix = useMemo(() => {
    const rows: MatrixCellData[][] = Array.from({ length: settings.rows }, () =>
      Array.from({ length: settings.columns }, () => ({ hazardLabels: [], hazardEntries: [] }))
    );

    raCase.hazards.forEach((hazard) => {
      const assessment = hazard.baseline;
      const cell = projectAssessmentToCell(assessment?.severity, assessment?.likelihood, settings);
      if (!cell) return;
      const cellData = rows[cell.row]![cell.column]!;
      cellData.hazardEntries.push({
        label: hazard.label,
        stepId: hazard.stepId,
        hazardId: hazard.id,
        displayNumber: hazardNumberMap.get(hazard.id)?.display ?? "?"
      });
    });

    // Compute aggregated numbers for display
    for (const row of rows) {
      for (const cell of row) {
        cell.hazardLabels = [aggregateNumbers(cell.hazardEntries)].filter(Boolean);
      }
    }

    return rows;
  }, [raCase.hazards, settings, hazardNumberMap]);

  const residualMatrix = useMemo(() => {
    const rows: MatrixCellData[][] = Array.from({ length: settings.rows }, () =>
      Array.from({ length: settings.columns }, () => ({ hazardLabels: [], hazardEntries: [] }))
    );

    raCase.hazards.forEach((hazard) => {
      const assessment = hazard.residual;
      const cell = projectAssessmentToCell(assessment?.severity, assessment?.likelihood, settings);
      if (!cell) return;
      const cellData = rows[cell.row]![cell.column]!;
      cellData.hazardEntries.push({
        label: hazard.label,
        stepId: hazard.stepId,
        hazardId: hazard.id,
        displayNumber: hazardNumberMap.get(hazard.id)?.display ?? "?"
      });
    });

    // Compute aggregated numbers for display
    for (const row of rows) {
      for (const cell of row) {
        cell.hazardLabels = [aggregateNumbers(cell.hazardEntries)].filter(Boolean);
      }
    }

    return rows;
  }, [raCase.hazards, settings, hazardNumberMap]);

  const hazardsInSelectedCell = useMemo(() => {
    if (!selectedCell) return [];
    const matrix = selectedCell.mode === "current" ? currentMatrix : residualMatrix;
    return matrix[selectedCell.row]?.[selectedCell.column]?.hazardEntries ?? [];
  }, [selectedCell, currentMatrix, residualMatrix]);

  // Get SUVA border color for a cell
  const getCellBorderColor = (row: number, col: number): string => {
    // Use SUVA pattern for 5x5 matrix
    if (settings.rows === 5 && settings.columns === 5) {
      return SUVA_ZONE_PATTERN[row]?.[col] ?? SUVA_BLUE;
    }

    // Fallback interpolation for non-5x5 matrices
    const normalizedRow = settings.rows > 1 ? row / (settings.rows - 1) : 0;
    const normalizedCol = settings.columns > 1 ? col / (settings.columns - 1) : 0;
    const riskScore = (normalizedRow + normalizedCol) / 2;

    if (riskScore < 0.33) return SUVA_BLUE;
    if (riskScore < 0.66) return SUVA_YELLOW;
    return SUVA_RED;
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

  // Render a single matrix
  const renderMatrix = (mode: MatrixMode, title: string, matrixData: MatrixCellData[][]) => (
    <div className="risk-matrix-single">
      <h3 className="risk-matrix-title">{title}</h3>
      <div className="risk-matrix-grid-wrapper">
        <table className="risk-matrix-grid risk-matrix-grid--suva">
          <thead>
            <tr>
              <th>{t("ra.matrix.axisHeader")}</th>
              {columnLabels.map((label, colIndex) => (
                <th key={`col-${colIndex}`}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowEntries.map(({ label, rowIndex }) => (
              <tr key={`row-${rowIndex}`}>
                <td>{label}</td>
                {columnLabels.map((_, colIndex) => {
                  const cellData = matrixData[rowIndex]?.[colIndex];
                  const hazardLabels = cellData?.hazardLabels ?? [];
                  const isSelected =
                    selectedCell?.mode === mode &&
                    selectedCell?.row === rowIndex &&
                    selectedCell?.column === colIndex;
                  const borderColor = getCellBorderColor(rowIndex, colIndex);

                  return (
                    <td key={`cell-${rowIndex}-${colIndex}`}>
                      <button
                        type="button"
                        className={`risk-cell risk-cell--bordered ${isSelected ? "selected" : ""}`}
                        style={{
                          borderColor: borderColor,
                          borderWidth: "3px",
                          borderStyle: "solid",
                          backgroundColor: "transparent"
                        }}
                        onClick={() =>
                          setSelectedCell((prev) =>
                            prev && prev.mode === mode && prev.row === rowIndex && prev.column === colIndex
                              ? null
                              : { row: rowIndex, column: colIndex, mode }
                          )
                        }
                      >
                        <span className="risk-cell-labels">
                          {hazardLabels.map((lbl, idx) => (
                            <span key={idx} className="risk-cell-hazard-label">{lbl}</span>
                          ))}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="risk-matrix-panel">
      <div className="risk-matrix-toolbar">
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

      <div className="risk-matrix-dual-container">
        {renderMatrix("current", "Current Risk", currentMatrix)}
        {renderMatrix("residual", "Residual Risk", residualMatrix)}
      </div>

      {selectedCell && (
        <div className="risk-matrix-details">
          <h4>
            {selectedCell.mode === "current" ? "Current Risk" : "Residual Risk"}: {rowLabels[selectedCell.row]} × {columnLabels[selectedCell.column]}
          </h4>
          {hazardsInSelectedCell.length === 0 ? (
            <p>No hazards plotted here yet.</p>
          ) : (
            <ul>
              {hazardsInSelectedCell.map((entry) => (
                <li key={entry.hazardId}>
                  <strong>
                    {entry.displayNumber} - {entry.label}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
