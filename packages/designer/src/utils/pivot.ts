import type { SummaryFunc } from "@xdarkoy/schema";
import { aggregate } from "./reportFields";

export interface PivotResult {
  rowKeys: string[];
  colKeys: string[];
  cells: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grand: number;
}

/**
 * Compute a cross-tab/pivot: distinct rowField values × distinct columnField
 * values, each cell aggregating valueField. Keys keep first-appearance order.
 */
export function pivot(
  rows: unknown[],
  rowField: string,
  columnField: string,
  valueField: string,
  agg: SummaryFunc = "sum",
): PivotResult {
  const rowKeys: string[] = [];
  const colKeys: string[] = [];
  const rSeen = new Set<string>();
  const cSeen = new Set<string>();
  // collision-free bucket key (row/col values may contain any characters)
  const key = (r: string, col: string) => JSON.stringify([r, col]);
  const buckets = new Map<string, number[]>();

  for (const row of rows) {
    const rec = (row ?? {}) as Record<string, unknown>;
    const r = String(rec[rowField] ?? "");
    const col = String(rec[columnField] ?? "");
    const v = Number(rec[valueField]);
    if (!rSeen.has(r)) { rSeen.add(r); rowKeys.push(r); }
    if (!cSeen.has(col)) { cSeen.add(col); colKeys.push(col); }
    const k = key(r, col);
    const arr = buckets.get(k);
    if (arr) arr.push(v); else buckets.set(k, [v]);
  }

  const cells: Record<string, Record<string, number>> = {};
  const rowTotals: Record<string, number> = {};
  const colTotals: Record<string, number> = {};
  for (const c of colKeys) colTotals[c] = 0;
  let grand = 0;

  for (const r of rowKeys) {
    cells[r] = {};
    rowTotals[r] = 0;
    for (const c of colKeys) {
      const vals = buckets.get(key(r, c)) ?? [];
      const val = vals.length ? aggregate(agg, vals) : 0;
      cells[r][c] = val;
      rowTotals[r] += val;
      colTotals[c] += val;
      grand += val;
    }
  }
  return { rowKeys, colKeys, cells, rowTotals, colTotals, grand };
}
