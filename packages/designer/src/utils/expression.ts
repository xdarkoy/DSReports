/**
 * Tiny expression/binding evaluator.
 *
 *  - "plain text"                                  → literal
 *  - "Hello {{user.name}}"                         → interpolation
 *  - "= item.qty * item.price"                     → evaluated expression
 *
 * Security: `new Function` is scoped to the data object and Math only –
 * no access to window/global.  Sufficient for design-time previews; the
 * final render happens server-side anyway.
 */

export type DataContext = Record<string, unknown>;

const EXPR_CACHE = new Map<string, (ctx: DataContext) => unknown>();

function compile(source: string): (ctx: DataContext) => unknown {
  const cached = EXPR_CACHE.get(source);
  if (cached) return cached;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      "ctx",
      "Math",
      `with (ctx) { try { return (${source}); } catch (e) { return undefined; } }`,
    ) as (ctx: DataContext, m: typeof Math) => unknown;
    const wrapped = (ctx: DataContext) => fn(ctx, Math);
    EXPR_CACHE.set(source, wrapped);
    return wrapped;
  } catch {
    const fallback = () => `⟨expr error⟩`;
    EXPR_CACHE.set(source, fallback);
    return fallback;
  }
}

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
    const result = compile(value.slice(1).trim())(data);
    return result == null ? "" : String(result);
  }
  if (value.includes("{{")) {
    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr: string) => {
      // Allow both property paths and small expressions
      if (/^[\w.]+$/.test(expr)) {
        const v = getPath(data, expr);
        return v == null ? "" : String(v);
      }
      const v = compile(expr)(data);
      return v == null ? "" : String(v);
    });
  }
  return value;
}

/** Resolve a bound array for tables / charts. */
export function evaluateArray(expr: string, data: DataContext): unknown[] {
  if (!expr) return [];
  const inner = expr.match(/\{\{\s*([^}]+?)\s*\}\}/)?.[1] ?? expr.replace(/^=/, "").trim();
  const v = /^[\w.]+$/.test(inner) ? getPath(data, inner) : compile(inner)(data);
  return Array.isArray(v) ? v : [];
}

/** Format numbers/dates using a small "{0:C}" / "{0:N2}" / "yyyy-MM-dd" syntax. */
export function applyFormat(value: unknown, format?: string): string {
  if (value == null || value === "") return "";
  if (!format) return String(value);
  if (/^\{0:([A-Za-z0-9]+)\}$/.test(format)) {
    const spec = format.match(/^\{0:([A-Za-z0-9]+)\}$/)![1];
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value);
    if (spec === "C")
      return new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(num);
    if (spec === "P") return new Intl.NumberFormat(undefined, { style: "percent" }).format(num);
    if (spec.startsWith("N")) {
      const d = Number(spec.slice(1)) || 0;
      return new Intl.NumberFormat(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }).format(num);
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
