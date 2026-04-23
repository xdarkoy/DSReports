import type { DataField } from "@reporting/schema";

/** Infer a @reporting/schema DataField[] tree from a sample JSON object. */
export function inferSchema(sample: unknown, name = "root"): DataField {
  if (sample === null || sample === undefined) {
    return { name, type: "string" };
  }
  if (Array.isArray(sample)) {
    const first = sample[0];
    const child = first !== undefined ? inferSchema(first, "[]") : { name: "[]", type: "string" as const };
    return { name, type: "array", fields: child.fields, sample };
  }
  switch (typeof sample) {
    case "number":
      return { name, type: "number", sample };
    case "boolean":
      return { name, type: "boolean", sample };
    case "object": {
      const fields: DataField[] = Object.entries(sample as Record<string, unknown>).map(
        ([k, v]) => inferSchema(v, k),
      );
      return { name, type: "object", fields, sample };
    }
    default: {
      const s = String(sample);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return { name, type: "date", sample };
      return { name, type: "string", sample };
    }
  }
}
