import { nanoid } from "nanoid";
import type { ReportElement, TableColumn } from "@xdarkoy/schema";
import { evaluateArray } from "./expression";

/** Build table columns from the first row of a bound array (scalar fields). */
export function columnsFromData(binding: string, data: Record<string, unknown>): TableColumn[] {
  const rows = evaluateArray(binding, data);
  const first = rows[0];
  if (!first || typeof first !== "object") return [];
  const keys = Object.keys(first as Record<string, unknown>).filter(
    (k) => (first as Record<string, unknown>)[k] === null || typeof (first as Record<string, unknown>)[k] !== "object",
  );
  if (!keys.length) return [];
  const width = Math.max(10, Math.floor(180 / keys.length));
  return keys.map((k) => ({ id: nanoid(6), header: k, cell: `{{row.${k}}}`, width }));
}

/**
 * Apply a dropped data-field binding (e.g. "{{invoice.total}}") to an element
 * by writing it to that element's primary data property. For tables/charts the
 * binding is the row source; for a table we also regenerate columns from the
 * data so rows actually show up.
 */
export function bindElement(
  el: ReportElement,
  binding: string,
  data: Record<string, unknown>,
): ReportElement {
  switch (el.type) {
    case "text":
    case "barcode":
      return { ...el, value: binding };
    case "image":
      return { ...el, source: binding };
    case "chart":
      return { ...el, dataSource: binding };
    case "table": {
      const cols = columnsFromData(binding, data);
      return { ...el, dataSource: binding, columns: cols.length ? cols : el.columns };
    }
    default:
      return el; // rectangle, line, pagebreak — nothing to bind
  }
}
