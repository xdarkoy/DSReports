/**
 * Tiny expression/binding evaluator.
 *
 *  - "plain text"                                  → literal
 *  - "Hello {{user.name}}"                         → interpolation
 *  - "= item.qty * item.price"                     → evaluated expression
 *
 * Security: expressions are parsed and evaluated by `safeExpr`, a small
 * interpreter over an allowlisted grammar (arithmetic, comparison, logical,
 * member/index access, a handful of pure numeric functions). There is no
 * access to `window`, `fetch`, globals, or arbitrary JS — opening an
 * untrusted report file cannot execute code.
 *
 * Number/date formatting is deterministic (no locale-dependent Intl) so the
 * design-time preview matches the Python server-side render byte-for-byte.
 */

import { evaluateExpr, type EvalContext } from "./safeExpr";

export type DataContext = Record<string, unknown>;

function getPath(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function evaluateValue(value: string, data: DataContext = {}): string {
  if (value == null) return "";
  if (typeof value !== "string") return String(value);
  if (value.startsWith("=")) {
    const result = evaluateExpr(value.slice(1).trim(), data as EvalContext);
    return result == null ? "" : String(result);
  }
  if (value.includes("{{")) {
    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr: string) => {
      // Fast path for plain dotted property paths; everything else is parsed.
      const v = /^[\w.]+$/.test(expr) ? getPath(data, expr) : evaluateExpr(expr, data as EvalContext);
      return v == null ? "" : String(v);
    });
  }
  return value;
}

function truthy(v: unknown): boolean {
  if (v == null || v === false || v === "") return false;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  return true;
}

/**
 * Evaluate a condition such as an element's `visibleIf`. An empty/undefined
 * expression is treated as "visible" (true). Mirrors the backend's
 * `evaluate_bool`.
 */
export function evaluateCondition(expr: string | undefined, data: DataContext = {}): boolean {
  if (expr == null || expr === "") return true;
  const src = expr.startsWith("=") ? expr.slice(1).trim() : expr.trim();
  const v = /^[\w.]+$/.test(src) ? getPath(data, src) : evaluateExpr(src, data as EvalContext);
  return truthy(v);
}

/** Resolve a bound array for tables / charts. */
export function evaluateArray(expr: string, data: DataContext): unknown[] {
  if (!expr) return [];
  const inner = expr.match(/\{\{\s*([^}]+?)\s*\}\}/)?.[1] ?? expr.replace(/^=/, "").trim();
  const v = /^[\w.]+$/.test(inner) ? getPath(data, inner) : evaluateExpr(inner, data as EvalContext);
  return Array.isArray(v) ? v : [];
}

/**
 * Deterministic grouped number formatting, e.g. (1234.5, 2) → "1,234.50".
 * Comma thousands separators, dot decimal — identical to Python's `f"{n:,.Nf}"`.
 */
function formatNumber(num: number, decimals: number): string {
  const fixed = Math.abs(num).toFixed(decimals);
  const [intPart, frac] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = num < 0 ? "-" : "";
  return frac ? `${sign}${grouped}.${frac}` : `${sign}${grouped}`;
}

/** Format numbers/dates using a small "{0:C}" / "{0:N2}" / "yyyy-MM-dd" syntax. */
export function applyFormat(value: unknown, format?: string): string {
  if (value == null || value === "") return "";
  if (!format) return String(value);
  const numMatch = format.match(/^\{0:([A-Za-z0-9]+)\}$/);
  if (numMatch) {
    const spec = numMatch[1];
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value);
    if (spec === "C") return `${formatNumber(num, 2)} €`;
    if (spec === "P") return `${Math.round(num * 100)}%`;
    if (spec.startsWith("N")) {
      const d = Number(spec.slice(1)) || 0;
      return formatNumber(num, d);
    }
  }
  // date
  const d = value instanceof Date ? value : new Date(String(value));
  if (!Number.isNaN(d.getTime()) && /[yMdHms]/.test(format)) {
    const pad = (n: number, l = 2) => String(n).padStart(l, "0");
    return format
      .replace(/yyyy/g, String(d.getFullYear()))
      .replace(/MM/g, pad(d.getMonth() + 1))
      .replace(/dd/g, pad(d.getDate()))
      .replace(/HH/g, pad(d.getHours()))
      .replace(/mm/g, pad(d.getMinutes()))
      .replace(/ss/g, pad(d.getSeconds()));
  }
  return String(value);
}
