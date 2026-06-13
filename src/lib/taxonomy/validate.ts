import { TaxonomyFileSchema } from "./schema";

export interface TaxonomyValidationError {
  path: string;
  message: string;
}

export interface TaxonomyValidationResult {
  valid: boolean;
  errors: TaxonomyValidationError[];
}

export function validateTaxonomyFile(json: unknown): TaxonomyValidationResult {
  const result = TaxonomyFileSchema.safeParse(json);

  if (result.success) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: result.error.issues.map((issue) => ({
      path: formatPath(issue.path),
      message: issue.message,
    })),
  };
}

function formatPath(path: PropertyKey[]): string {
  let formattedPath = "$";

  for (const segment of path) {
    if (typeof segment === "number") {
      formattedPath = `${formattedPath}[${segment}]`;
    } else {
      formattedPath = `${formattedPath}.${String(segment)}`;
    }
  }

  return formattedPath;
}
