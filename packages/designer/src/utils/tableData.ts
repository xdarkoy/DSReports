import type { TableElement } from "@reporting/schema";
import { evaluateCondition } from "./expression";

/**
 * Apply a table's record selection (filter) and sort to its bound rows —
 * Crystal-style "Select Expert" + record sorting. Returns a new array; the
 * input is not mutated.
 */
export function shapeRows(
  rows: unknown[],
  el: TableElement,
  data: Record<string, unknown>,
): unknown[] {
  let out = rows;
  if (el.filter) {
    out = out.filter((row) => evaluateCondition(el.filter as string, { ...data, row }));
  }
  if (el.sort?.length) {
    out = [...out].sort((a, b) => {
      for (const s of el.sort!) {
        const av = (a as Record<string, unknown>)?.[s.field];
        const bv = (b as Record<string, unknown>)?.[s.field];
        if (av == null && bv == null) continue;
        if (av == null) return s.dir === "desc" ? 1 : -1;
        if (bv == null) return s.dir === "desc" ? -1 : 1;
        if (av < bv) return s.dir === "desc" ? 1 : -1;
        if (av > bv) return s.dir === "desc" ? -1 : 1;
      }
      return 0;
    });
  }
  return out;
}
