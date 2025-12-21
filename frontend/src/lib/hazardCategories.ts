/**
 * Hazard categories based on SUVA 66089 taxonomy.
 * Used for classifying hazards during identification phase.
 */

export interface HazardCategory {
  code: string;
  label: string;
  examples: string[];
}

export const HAZARD_CATEGORIES: HazardCategory[] = [
  {
    code: "MECHANICAL",
    label: "Mechanical",
    examples: ["Moving parts", "Sharp edges", "Falling objects", "Pressurized systems"]
  },
  {
    code: "FALLS",
    label: "Falls",
    examples: ["Working at height", "Slippery surfaces", "Obstacles", "Poor visibility"]
  },
  {
    code: "ELECTRICAL",
    label: "Electrical",
    examples: ["Live parts", "Static discharge", "Short circuits", "Arcs"]
  },
  {
    code: "HAZARDOUS_SUBSTANCES",
    label: "Hazardous Substances",
    examples: ["Toxic/corrosive chemicals", "Biological agents", "Dusts", "Fumes"]
  },
  {
    code: "FIRE_EXPLOSION",
    label: "Fire & Explosion",
    examples: ["Flammable materials", "Ignition sources", "Explosive atmospheres"]
  },
  {
    code: "THERMAL",
    label: "Thermal",
    examples: ["Hot/cold surfaces", "Flames", "Steam", "Splashes"]
  },
  {
    code: "PHYSICAL",
    label: "Physical",
    examples: ["Noise", "Radiation (UV, laser, X-ray)", "Pressure changes"]
  },
  {
    code: "ENVIRONMENTAL",
    label: "Environmental",
    examples: ["Climate", "Lighting", "Air quality"]
  },
  {
    code: "ERGONOMIC",
    label: "Ergonomic",
    examples: ["Posture", "Lifting", "Repetitive motion", "Vibration"]
  },
  {
    code: "PSYCHOLOGICAL",
    label: "Psychological",
    examples: ["Stress", "Overload", "Isolation", "Harassment"]
  },
  {
    code: "CONTROL_FAILURES",
    label: "Control Failures",
    examples: ["System malfunctions", "Unexpected machine behavior"]
  },
  {
    code: "POWER_FAILURE",
    label: "Power Failure",
    examples: ["Outages", "Interruptions"]
  },
  {
    code: "ORGANIZATIONAL",
    label: "Organizational",
    examples: ["Training gaps", "Unclear procedures", "Communication failures"]
  }
];

/**
 * Get a hazard category by its code.
 */
export function getCategoryByCode(code: string): HazardCategory | undefined {
  return HAZARD_CATEGORIES.find((cat) => cat.code === code);
}

/**
 * Get the display label for a category code.
 */
export function getCategoryLabel(
  code: string | null | undefined,
  t?: (key: string, options?: { fallback?: string }) => string
): string {
  if (!code) {
    return t ? t("common.noData", { fallback: "—" }) : "—";
  }
  const category = getCategoryByCode(code);
  if (t) {
    return t(`domain.hazardCategories.${code}`, { fallback: category?.label ?? code });
  }
  return category?.label ?? code;
}
