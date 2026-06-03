/**
 * Safe expression evaluator.
 *
 * Replaces the previous `new Function(...)` implementation, which executed
 * arbitrary JavaScript from the report file (with full access to `fetch`,
 * `window`, etc.). This is a tiny recursive-descent interpreter over an
 * allowlisted grammar:
 *
 *   literals     123  1.5  "x"  'y'  true  false  null
 *   identifiers  foo  row.qty  data.items[0].price
 *   arithmetic   + - * / %        (no ** — avoids cheap DoS)
 *   comparison   == != === !== < <= > >=
 *   logical      && || !  and ternary  cond ? a : b
 *   functions    abs round floor ceil sqrt min max  (numeric, pure)
 *
 * Anything outside the grammar (calls to unknown names, member access on
 * functions, `**`, etc.) fails to parse and the expression evaluates to
 * `undefined`. The Python backend mirrors this grammar in
 * `reporting_backend/expression.py` so design-time and server-side renders
 * agree.
 */

export type EvalContext = Record<string, unknown>;

type Node =
  | { k: "lit"; v: unknown }
  | { k: "id"; name: string }
  | { k: "member"; obj: Node; prop: string }
  | { k: "index"; obj: Node; index: Node }
  | { k: "call"; name: string; args: Node[] }
  | { k: "unary"; op: string; arg: Node }
  | { k: "bin"; op: string; l: Node; r: Node }
  | { k: "logical"; op: string; l: Node; r: Node }
  | { k: "cond"; test: Node; a: Node; b: Node };

const FUNCS: Record<string, (...a: number[]) => number> = {
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sqrt: Math.sqrt,
  min: Math.min,
  max: Math.max,
};

// ---- tokenizer -----------------------------------------------------------

type Token = { t: "num" | "str" | "id" | "op"; v: string } | { t: "eof"; v: "" };

const MULTI_OPS = ["===", "!==", "==", "!=", "<=", ">=", "&&", "||"];
const SINGLE_OPS = new Set(["+", "-", "*", "/", "%", "<", ">", "!", "?", ":", ".", ",", "(", ")", "[", "]"]);

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    // string
    if (c === '"' || c === "'") {
      const quote = c;
      let s = "";
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) {
          const e = src[++i];
          s += e === "n" ? "\n" : e === "t" ? "\t" : e;
        } else s += src[i];
        i++;
      }
      if (i >= n) throw new Error("unterminated string");
      i++; // closing quote
      out.push({ t: "str", v: s });
      continue;
    }
    // number
    if (c >= "0" && c <= "9") {
      let s = "";
      while (i < n && ((src[i] >= "0" && src[i] <= "9") || src[i] === ".")) s += src[i++];
      out.push({ t: "num", v: s });
      continue;
    }
    // identifier
    if (/[A-Za-z_$]/.test(c)) {
      let s = "";
      while (i < n && /[A-Za-z0-9_$]/.test(src[i])) s += src[i++];
      out.push({ t: "id", v: s });
      continue;
    }
    // multi-char operator
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    const m = MULTI_OPS.find((op) => op.length === 3 && op === three) ?? MULTI_OPS.find((op) => op.length === 2 && op === two);
    if (m) { out.push({ t: "op", v: m }); i += m.length; continue; }
    if (SINGLE_OPS.has(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new Error(`unexpected character '${c}'`);
  }
  out.push({ t: "eof", v: "" });
  return out;
}

// ---- parser (recursive descent, precedence climbing) ---------------------

class Parser {
  private p = 0;
  constructor(private readonly toks: Token[]) {}

  private peek(): Token { return this.toks[this.p]; }
  private next(): Token { return this.toks[this.p++]; }
  private isOp(v: string): boolean { const t = this.peek(); return t.t === "op" && t.v === v; }
  private eat(v: string): void {
    if (!this.isOp(v)) throw new Error(`expected '${v}'`);
    this.p++;
  }

  parse(): Node {
    const node = this.ternary();
    if (this.peek().t !== "eof") throw new Error("trailing tokens");
    return node;
  }

  private ternary(): Node {
    const test = this.or();
    if (this.isOp("?")) {
      this.next();
      const a = this.ternary();
      this.eat(":");
      const b = this.ternary();
      return { k: "cond", test, a, b };
    }
    return test;
  }

  private or(): Node {
    let l = this.and();
    while (this.isOp("||")) { this.next(); l = { k: "logical", op: "||", l, r: this.and() }; }
    return l;
  }

  private and(): Node {
    let l = this.equality();
    while (this.isOp("&&")) { this.next(); l = { k: "logical", op: "&&", l, r: this.equality() }; }
    return l;
  }

  private equality(): Node {
    let l = this.comparison();
    while (this.isOp("==") || this.isOp("!=") || this.isOp("===") || this.isOp("!==")) {
      const op = this.next().v;
      l = { k: "bin", op, l, r: this.comparison() };
    }
    return l;
  }

  private comparison(): Node {
    let l = this.additive();
    while (this.isOp("<") || this.isOp("<=") || this.isOp(">") || this.isOp(">=")) {
      const op = this.next().v;
      l = { k: "bin", op, l, r: this.additive() };
    }
    return l;
  }

  private additive(): Node {
    let l = this.multiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const op = this.next().v;
      l = { k: "bin", op, l, r: this.multiplicative() };
    }
    return l;
  }

  private multiplicative(): Node {
    let l = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = this.next().v;
      l = { k: "bin", op, l, r: this.unary() };
    }
    return l;
  }

  private unary(): Node {
    if (this.isOp("!") || this.isOp("-")) {
      const op = this.next().v;
      return { k: "unary", op, arg: this.unary() };
    }
    return this.postfix();
  }

  private postfix(): Node {
    let node = this.primary();
    for (;;) {
      if (this.isOp(".")) {
        this.next();
        const t = this.next();
        if (t.t !== "id") throw new Error("expected property name");
        node = { k: "member", obj: node, prop: t.v };
      } else if (this.isOp("[")) {
        this.next();
        const index = this.ternary();
        this.eat("]");
        node = { k: "index", obj: node, index };
      } else break;
    }
    return node;
  }

  private primary(): Node {
    const t = this.peek();
    if (t.t === "num") { this.next(); return { k: "lit", v: Number(t.v) }; }
    if (t.t === "str") { this.next(); return { k: "lit", v: t.v }; }
    if (this.isOp("(")) { this.next(); const e = this.ternary(); this.eat(")"); return e; }
    if (t.t === "id") {
      this.next();
      if (t.v === "true") return { k: "lit", v: true };
      if (t.v === "false") return { k: "lit", v: false };
      if (t.v === "null") return { k: "lit", v: null };
      if (this.isOp("(")) {
        // function call — only allowlisted names are callable
        if (!(t.v in FUNCS)) throw new Error(`unknown function '${t.v}'`);
        this.next();
        const args: Node[] = [];
        if (!this.isOp(")")) {
          args.push(this.ternary());
          while (this.isOp(",")) { this.next(); args.push(this.ternary()); }
        }
        this.eat(")");
        return { k: "call", name: t.v, args };
      }
      return { k: "id", name: t.v };
    }
    throw new Error("unexpected token");
  }
}

// ---- evaluation ----------------------------------------------------------

function truthy(v: unknown): boolean {
  if (v == null || v === false || v === "") return false;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  return true;
}

function getProp(obj: unknown, key: string | number): unknown {
  if (obj == null) return undefined;
  return (obj as Record<string | number, unknown>)[key];
}

function evalNode(node: Node, ctx: EvalContext): unknown {
  switch (node.k) {
    case "lit": return node.v;
    case "id": return getProp(ctx, node.name);
    case "member": return getProp(evalNode(node.obj, ctx), node.prop);
    case "index": {
      const idx = evalNode(node.index, ctx);
      const key = typeof idx === "number" ? idx : String(idx);
      return getProp(evalNode(node.obj, ctx), key);
    }
    case "call": {
      const fn = FUNCS[node.name];
      const args = node.args.map((a) => Number(evalNode(a, ctx)));
      const r = fn(...args);
      return Number.isFinite(r) ? r : undefined;
    }
    case "unary": {
      const v = evalNode(node.arg, ctx);
      if (node.op === "!") return !truthy(v);
      const num = Number(v);
      return Number.isNaN(num) ? undefined : -num;
    }
    case "logical": {
      const l = evalNode(node.l, ctx);
      if (node.op === "&&") return truthy(l) ? evalNode(node.r, ctx) : l;
      return truthy(l) ? l : evalNode(node.r, ctx);
    }
    case "cond":
      return truthy(evalNode(node.test, ctx)) ? evalNode(node.a, ctx) : evalNode(node.b, ctx);
    case "bin":
      return evalBin(node.op, evalNode(node.l, ctx), evalNode(node.r, ctx));
  }
}

function evalBin(op: string, l: unknown, r: unknown): unknown {
  switch (op) {
    case "==":
    case "===": return l === r;
    case "!=":
    case "!==": return l !== r;
  }
  // + concatenates when either side is a string
  if (op === "+" && (typeof l === "string" || typeof r === "string")) {
    return `${l ?? ""}${r ?? ""}`;
  }
  // ordering comparisons work on matching primitive types
  if (op === "<" || op === "<=" || op === ">" || op === ">=") {
    if ((typeof l === "number" && typeof r === "number") || (typeof l === "string" && typeof r === "string")) {
      switch (op) {
        case "<": return (l as number) < (r as number);
        case "<=": return (l as number) <= (r as number);
        case ">": return (l as number) > (r as number);
        case ">=": return (l as number) >= (r as number);
      }
    }
    return false;
  }
  const a = Number(l);
  const b = Number(r);
  if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return b === 0 ? undefined : a / b;
    case "%": return b === 0 ? undefined : a % b;
  }
  return undefined;
}

const AST_CACHE = new Map<string, Node | null>();

/** Evaluate an expression against a context. Returns `undefined` on any error. */
export function evaluateExpr(source: string, ctx: EvalContext = {}): unknown {
  let ast = AST_CACHE.get(source);
  if (ast === undefined) {
    try {
      ast = new Parser(tokenize(source)).parse();
    } catch {
      ast = null; // unparseable — cache the failure
    }
    AST_CACHE.set(source, ast);
  }
  if (ast === null) return undefined;
  try {
    return evalNode(ast, ctx);
  } catch {
    return undefined;
  }
}
