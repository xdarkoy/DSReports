import type { ConditionalFormat } from "@reporting/schema";
import { evaluateCondition } from "./expression";

/**
 * Merge conditional-formatting rules over a base style (Crystal "Highlighting
 * Expert"). Each rule whose `when` is truthy contributes its style; later rules
 * win.
 */
export function mergeConditional<T extends object>(
  base: T | undefined,
  rules: ConditionalFormat[] | undefined,
  data: Record<string, unknown>,
): T {
  let style = { ...(base ?? {}) } as T;
  for (const r of rules ?? []) {
    if (r.when && evaluateCondition(r.when, data)) {
      style = { ...style, ...(r.style as object) } as T;
    }
  }
  return style;
}
