import riskMatrixFixture from "../../../fixtures/methodology/risk-matrix.json" with {
  type: "json",
};

export const SEVERITY_CODES = ["A", "B", "C", "D", "E"] as const;
export const LIKELIHOOD_CODES = ["1", "2", "3", "4", "5"] as const;
export const RISK_BAND_CODES = ["HIGH", "MEDIUM", "LOW"] as const;

export type SeverityCode = (typeof SEVERITY_CODES)[number];
export type LikelihoodCode = (typeof LIKELIHOOD_CODES)[number];
export type RiskBandCode = (typeof RISK_BAND_CODES)[number];

export type RiskMatrixCell = {
  severity: SeverityCode;
  likelihood: LikelihoodCode;
  band: RiskBandCode;
};

export const EXPECTED_RISK_MATRIX: Record<
  LikelihoodCode,
  Record<SeverityCode, RiskBandCode>
> = {
  "1": {
    A: "HIGH",
    B: "HIGH",
    C: "MEDIUM",
    D: "MEDIUM",
    E: "MEDIUM",
  },
  "2": {
    A: "HIGH",
    B: "HIGH",
    C: "MEDIUM",
    D: "LOW",
    E: "LOW",
  },
  "3": {
    A: "HIGH",
    B: "MEDIUM",
    C: "MEDIUM",
    D: "LOW",
    E: "LOW",
  },
  "4": {
    A: "MEDIUM",
    B: "LOW",
    C: "LOW",
    D: "LOW",
    E: "LOW",
  },
  "5": {
    A: "LOW",
    B: "LOW",
    C: "LOW",
    D: "LOW",
    E: "LOW",
  },
} as const;

export class RiskMatrixValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RiskMatrixValidationError";
  }
}

const severitySet = new Set<string>(SEVERITY_CODES);
const likelihoodSet = new Set<string>(LIKELIHOOD_CODES);
const riskBandSet = new Set<string>(RISK_BAND_CODES);

export const RISK_MATRIX_CELLS = validateRiskMatrixFixture(riskMatrixFixture);

const riskBandByCell = new Map(
  RISK_MATRIX_CELLS.map((cell) => [cellKey(cell.severity, cell.likelihood), cell.band]),
);

export function lookupRiskBand(
  severity: string,
  likelihood: string,
): RiskBandCode {
  const severityCode = parseSeverityCode(severity, "severity");
  const likelihoodCode = parseLikelihoodCode(likelihood, "likelihood");
  const band = riskBandByCell.get(cellKey(severityCode, likelihoodCode));

  if (!band) {
    throw new RiskMatrixValidationError(
      `Risk matrix is missing severity ${severityCode}, likelihood ${likelihoodCode}`,
    );
  }

  return band;
}

export function validateRiskMatrixFixture(fixture: unknown): RiskMatrixCell[] {
  if (!Array.isArray(fixture)) {
    throw new RiskMatrixValidationError("Risk matrix fixture must be an array");
  }

  if (fixture.length !== SEVERITY_CODES.length * LIKELIHOOD_CODES.length) {
    throw new RiskMatrixValidationError(
      `Risk matrix fixture must contain exactly 25 cells, received ${fixture.length}`,
    );
  }

  const seen = new Set<string>();
  const cells = fixture.map((entry, index) => validateCell(entry, index));

  for (const cell of cells) {
    const key = cellKey(cell.severity, cell.likelihood);

    if (seen.has(key)) {
      throw new RiskMatrixValidationError(
        `Risk matrix fixture contains duplicate cell ${key}`,
      );
    }

    seen.add(key);

    const expectedBand = EXPECTED_RISK_MATRIX[cell.likelihood][cell.severity];
    if (cell.band !== expectedBand) {
      throw new RiskMatrixValidationError(
        `Risk matrix cell ${key} must be ${expectedBand}, received ${cell.band}`,
      );
    }
  }

  for (const likelihood of LIKELIHOOD_CODES) {
    for (const severity of SEVERITY_CODES) {
      const key = cellKey(severity, likelihood);
      if (!seen.has(key)) {
        throw new RiskMatrixValidationError(`Risk matrix fixture is missing cell ${key}`);
      }
    }
  }

  return cells;
}

function validateCell(entry: unknown, index: number): RiskMatrixCell {
  if (!isRecord(entry)) {
    throw new RiskMatrixValidationError(`Risk matrix cell ${index} must be an object`);
  }

  const keys = Object.keys(entry).sort();
  if (keys.join(",") !== "band,likelihood,severity") {
    throw new RiskMatrixValidationError(
      `Risk matrix cell ${index} must contain only severity, likelihood, and band`,
    );
  }

  return {
    severity: parseSeverityCode(entry.severity, `cell ${index}.severity`),
    likelihood: parseLikelihoodCode(entry.likelihood, `cell ${index}.likelihood`),
    band: parseRiskBandCode(entry.band, `cell ${index}.band`),
  };
}

function parseSeverityCode(value: unknown, label: string): SeverityCode {
  if (typeof value === "string" && severitySet.has(value)) {
    return value as SeverityCode;
  }

  throw new RiskMatrixValidationError(
    `${label} must be one of ${SEVERITY_CODES.join(", ")}`,
  );
}

function parseLikelihoodCode(value: unknown, label: string): LikelihoodCode {
  if (typeof value === "string" && likelihoodSet.has(value)) {
    return value as LikelihoodCode;
  }

  throw new RiskMatrixValidationError(
    `${label} must be one of ${LIKELIHOOD_CODES.join(", ")}`,
  );
}

function parseRiskBandCode(value: unknown, label: string): RiskBandCode {
  if (typeof value === "string" && riskBandSet.has(value)) {
    return value as RiskBandCode;
  }

  throw new RiskMatrixValidationError(
    `${label} must be one of ${RISK_BAND_CODES.join(", ")}`,
  );
}

function cellKey(severity: SeverityCode, likelihood: LikelihoodCode): string {
  return `${severity}:${likelihood}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
