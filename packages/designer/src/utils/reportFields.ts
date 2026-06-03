import type { SummaryFunc } from "@xdarkoy/schema";

/**
 * Crystal-Reports-style "Special Fields" injected into the evaluation context,
 * usable in any binding, e.g. "{{Page}}", "Seite {{PageNofM}}", "{{PrintDate}}".
 *
 *   Page         current page number (1-based)
 *   PageCount    total number of pages
 *   PageNofM     "1 / 3"
 *   PrintDate    render date  (yyyy-MM-dd)
 *   PrintTime    render time  (HH:mm)
 *   ReportTitle  document title
 *
 * The baseline renderer produces a single page, so Page/PageCount are 1 until
 * multi-page pagination lands.
 */
export function systemFields(opts: {
  page?: number;
  pageCount?: number;
  title?: string;
  now?: Date;
} = {}): Record<string, unknown> {
  const now = opts.now ?? new Date();
  const page = opts.page ?? 1;
  const pageCount = opts.pageCount ?? 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    Page: page,
    PageCount: pageCount,
    PageNofM: `${page} / ${pageCount}`,
    PrintDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    PrintTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    ReportTitle: opts.title ?? "",
  };
}

/** Compute a Crystal-style summary over a column's per-row numeric values. */
export function aggregate(func: SummaryFunc, values: number[]): number {
  const nums = values.filter((v) => Number.isFinite(v));
  switch (func) {
    case "count":
      return values.length; // record count (all rows)
    case "sum":
      return nums.reduce((a, b) => a + b, 0);
    case "avg":
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    case "min":
      return nums.length ? Math.min(...nums) : 0;
    case "max":
      return nums.length ? Math.max(...nums) : 0;
  }
}
