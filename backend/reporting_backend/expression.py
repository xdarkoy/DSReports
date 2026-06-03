"""Safe expression/binding evaluator.

Mirrors the TypeScript evaluator in ``packages/designer/src/utils`` so the
server-side render produces identical output. Expressions are parsed and
evaluated by a tiny interpreter over an allowlisted grammar (arithmetic,
comparison, logical, member/index access, a handful of pure numeric
functions). There is **no** ``eval``/``exec`` and no attribute access on
arbitrary objects, so a hostile report document cannot execute code or
exhaust resources via tricks like ``9**9**9``.
"""
from __future__ import annotations

import math
import re
from datetime import datetime
from typing import Any, Callable, List, Mapping, Optional

_BINDING = re.compile(r"\{\{\s*([^}]+?)\s*\}\}")
_SIMPLE_PATH = re.compile(r"^[\w.]+$")

_FUNCS: dict[str, Callable[..., float]] = {
    "abs": abs,
    "round": lambda x: math.floor(x + 0.5),  # JS Math.round: half away from zero (up)
    "floor": math.floor,
    "ceil": math.ceil,
    "sqrt": math.sqrt,
    "min": min,
    "max": max,
}


# ---------------------------------------------------------------------------
# value coercion (mirrors JS Number()/String() where it matters for parity)
# ---------------------------------------------------------------------------


def _to_number(v: Any) -> float:
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip()
        if s == "":
            return 0.0
        try:
            return float(s)
        except ValueError:
            return math.nan
    return math.nan


def _to_str(v: Any) -> str:
    """Stringify like JS String(): integer-valued floats lose the trailing .0."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        if math.isfinite(v) and v == int(v):
            return str(int(v))
        return repr(v)
    if isinstance(v, int):
        return str(v)
    return str(v)


def _truthy(v: Any) -> bool:
    if v is None or v is False or v == "":
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0 and not (isinstance(v, float) and math.isnan(v))
    return True


def _get_prop(obj: Any, key: Any) -> Any:
    if obj is None:
        return None
    if isinstance(obj, Mapping):
        return obj.get(key)
    if isinstance(obj, list):
        if isinstance(key, (int, float)):
            idx = int(key)
            return obj[idx] if 0 <= idx < len(obj) else None
    return None


# ---------------------------------------------------------------------------
# tokenizer
# ---------------------------------------------------------------------------

_MULTI_OPS = ["===", "!==", "==", "!=", "<=", ">=", "&&", "||"]
_SINGLE_OPS = set("+-*/%<>!?:.,()[]")
_ID_START = re.compile(r"[A-Za-z_$]")
_ID_CHAR = re.compile(r"[A-Za-z0-9_$]")


class _Tok:
    __slots__ = ("t", "v")

    def __init__(self, t: str, v: str) -> None:
        self.t = t
        self.v = v


def _tokenize(src: str) -> List[_Tok]:
    out: List[_Tok] = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c in " \t\n\r":
            i += 1
            continue
        if c in ("'", '"'):
            quote = c
            i += 1
            buf = []
            while i < n and src[i] != quote:
                if src[i] == "\\" and i + 1 < n:
                    i += 1
                    e = src[i]
                    buf.append("\n" if e == "n" else "\t" if e == "t" else e)
                else:
                    buf.append(src[i])
                i += 1
            if i >= n:
                raise ValueError("unterminated string")
            i += 1
            out.append(_Tok("str", "".join(buf)))
            continue
        if c.isdigit():
            j = i
            while j < n and (src[j].isdigit() or src[j] == "."):
                j += 1
            out.append(_Tok("num", src[i:j]))
            i = j
            continue
        if _ID_START.match(c):
            j = i
            while j < n and _ID_CHAR.match(src[j]):
                j += 1
            out.append(_Tok("id", src[i:j]))
            i = j
            continue
        three, two = src[i:i + 3], src[i:i + 2]
        m = next((op for op in _MULTI_OPS if len(op) == 3 and op == three), None) \
            or next((op for op in _MULTI_OPS if len(op) == 2 and op == two), None)
        if m:
            out.append(_Tok("op", m))
            i += len(m)
            continue
        if c in _SINGLE_OPS:
            out.append(_Tok("op", c))
            i += 1
            continue
        raise ValueError(f"unexpected character {c!r}")
    out.append(_Tok("eof", ""))
    return out


# ---------------------------------------------------------------------------
# parser  (AST nodes are plain tuples: (kind, ...))
# ---------------------------------------------------------------------------


class _Parser:
    def __init__(self, toks: List[_Tok]) -> None:
        self.toks = toks
        self.p = 0

    def _peek(self) -> _Tok:
        return self.toks[self.p]

    def _next(self) -> _Tok:
        t = self.toks[self.p]
        self.p += 1
        return t

    def _is_op(self, v: str) -> bool:
        t = self._peek()
        return t.t == "op" and t.v == v

    def _eat(self, v: str) -> None:
        if not self._is_op(v):
            raise ValueError(f"expected {v!r}")
        self.p += 1

    def parse(self) -> tuple:
        node = self._ternary()
        if self._peek().t != "eof":
            raise ValueError("trailing tokens")
        return node

    def _ternary(self) -> tuple:
        test = self._or()
        if self._is_op("?"):
            self._next()
            a = self._ternary()
            self._eat(":")
            b = self._ternary()
            return ("cond", test, a, b)
        return test

    def _or(self) -> tuple:
        left = self._and()
        while self._is_op("||"):
            self._next()
            left = ("logical", "||", left, self._and())
        return left

    def _and(self) -> tuple:
        left = self._equality()
        while self._is_op("&&"):
            self._next()
            left = ("logical", "&&", left, self._equality())
        return left

    def _equality(self) -> tuple:
        left = self._comparison()
        while self._is_op("==") or self._is_op("!=") or self._is_op("===") or self._is_op("!=="):
            op = self._next().v
            left = ("bin", op, left, self._comparison())
        return left

    def _comparison(self) -> tuple:
        left = self._additive()
        while self._is_op("<") or self._is_op("<=") or self._is_op(">") or self._is_op(">="):
            op = self._next().v
            left = ("bin", op, left, self._additive())
        return left

    def _additive(self) -> tuple:
        left = self._multiplicative()
        while self._is_op("+") or self._is_op("-"):
            op = self._next().v
            left = ("bin", op, left, self._multiplicative())
        return left

    def _multiplicative(self) -> tuple:
        left = self._unary()
        while self._is_op("*") or self._is_op("/") or self._is_op("%"):
            op = self._next().v
            left = ("bin", op, left, self._unary())
        return left

    def _unary(self) -> tuple:
        if self._is_op("!") or self._is_op("-"):
            op = self._next().v
            return ("unary", op, self._unary())
        return self._postfix()

    def _postfix(self) -> tuple:
        node = self._primary()
        while True:
            if self._is_op("."):
                self._next()
                t = self._next()
                if t.t != "id":
                    raise ValueError("expected property name")
                node = ("member", node, t.v)
            elif self._is_op("["):
                self._next()
                index = self._ternary()
                self._eat("]")
                node = ("index", node, index)
            else:
                break
        return node

    def _primary(self) -> tuple:
        t = self._peek()
        if t.t == "num":
            self._next()
            return ("lit", float(t.v))
        if t.t == "str":
            self._next()
            return ("lit", t.v)
        if self._is_op("("):
            self._next()
            e = self._ternary()
            self._eat(")")
            return e
        if t.t == "id":
            self._next()
            if t.v == "true":
                return ("lit", True)
            if t.v == "false":
                return ("lit", False)
            if t.v == "null":
                return ("lit", None)
            if self._is_op("("):
                if t.v not in _FUNCS:
                    raise ValueError(f"unknown function {t.v!r}")
                self._next()
                args: List[tuple] = []
                if not self._is_op(")"):
                    args.append(self._ternary())
                    while self._is_op(","):
                        self._next()
                        args.append(self._ternary())
                self._eat(")")
                return ("call", t.v, args)
            return ("id", t.v)
        raise ValueError("unexpected token")


# ---------------------------------------------------------------------------
# evaluation
# ---------------------------------------------------------------------------


def _eval_node(node: tuple, ctx: Mapping[str, Any]) -> Any:
    kind = node[0]
    if kind == "lit":
        return node[1]
    if kind == "id":
        return _get_prop(ctx, node[1])
    if kind == "member":
        return _get_prop(_eval_node(node[1], ctx), node[2])
    if kind == "index":
        idx = _eval_node(node[2], ctx)
        key = idx if isinstance(idx, (int, float)) else _to_str(idx)
        return _get_prop(_eval_node(node[1], ctx), key)
    if kind == "call":
        fn = _FUNCS[node[1]]
        args = [_to_number(_eval_node(a, ctx)) for a in node[2]]
        try:
            r = fn(*args)
        except (ValueError, TypeError):
            return None
        return r if isinstance(r, (int, float)) and math.isfinite(r) else None
    if kind == "unary":
        v = _eval_node(node[2], ctx)
        if node[1] == "!":
            return not _truthy(v)
        num = _to_number(v)
        return None if math.isnan(num) else -num
    if kind == "logical":
        left = _eval_node(node[2], ctx)
        if node[1] == "&&":
            return _eval_node(node[3], ctx) if _truthy(left) else left
        return left if _truthy(left) else _eval_node(node[3], ctx)
    if kind == "cond":
        return _eval_node(node[2], ctx) if _truthy(_eval_node(node[1], ctx)) else _eval_node(node[3], ctx)
    if kind == "bin":
        return _eval_bin(node[1], _eval_node(node[2], ctx), _eval_node(node[3], ctx))
    return None


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _eval_bin(op: str, left: Any, right: Any) -> Any:
    if op in ("==", "==="):
        return _strict_eq(left, right)
    if op in ("!=", "!=="):
        return not _strict_eq(left, right)
    if op == "+" and (isinstance(left, str) or isinstance(right, str)):
        return _to_str(left) + _to_str(right)
    if op in ("<", "<=", ">", ">="):
        if (_is_number(left) and _is_number(right)) or (isinstance(left, str) and isinstance(right, str)):
            if op == "<":
                return left < right
            if op == "<=":
                return left <= right
            if op == ">":
                return left > right
            return left >= right
        return False
    a, b = _to_number(left), _to_number(right)
    if math.isnan(a) or math.isnan(b):
        return None
    if op == "+":
        return a + b
    if op == "-":
        return a - b
    if op == "*":
        return a * b
    if op == "/":
        return None if b == 0 else a / b
    if op == "%":
        return None if b == 0 else math.fmod(a, b)
    return None


def _strict_eq(left: Any, right: Any) -> bool:
    if _is_number(left) and _is_number(right):
        return left == right
    if isinstance(left, bool) and isinstance(right, bool):
        return left == right
    if isinstance(left, str) and isinstance(right, str):
        return left == right
    if left is None and right is None:
        return True
    return False


_AST_CACHE: dict[str, Optional[tuple]] = {}


def _evaluate_expr(source: str, ctx: Mapping[str, Any]) -> Any:
    if source in _AST_CACHE:
        ast = _AST_CACHE[source]
    else:
        try:
            ast = _Parser(_tokenize(source)).parse()
        except Exception:
            ast = None
        _AST_CACHE[source] = ast
    if ast is None:
        return None
    try:
        return _eval_node(ast, ctx)
    except Exception:
        return None


def _get_path(ctx: Mapping[str, Any], path: str) -> Any:
    cur: Any = ctx
    for part in path.split("."):
        if not isinstance(cur, Mapping):
            return None
        cur = cur.get(part)
    return cur


# ---------------------------------------------------------------------------
# public API
# ---------------------------------------------------------------------------


def evaluate_value(value: Any, ctx: Mapping[str, Any]) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        return _to_str(value)
    if value.startswith("="):
        out = _evaluate_expr(value[1:].strip(), ctx)
        return "" if out is None else _to_str(out)
    if "{{" in value:
        def repl(m: "re.Match[str]") -> str:
            inner = m.group(1).strip()
            v = _get_path(ctx, inner) if _SIMPLE_PATH.match(inner) else _evaluate_expr(inner, ctx)
            return "" if v is None else _to_str(v)
        return _BINDING.sub(repl, value)
    return value


def resolve_binding(expr: Any, ctx: Mapping[str, Any]) -> Any:
    """Resolve a binding/expression to its raw value (dict/list/scalar/None)."""
    if not expr or not isinstance(expr, str):
        return None
    m = _BINDING.search(expr)
    inner = m.group(1).strip() if m else expr.lstrip("=").strip()
    return _get_path(ctx, inner) if _SIMPLE_PATH.match(inner) else _evaluate_expr(inner, ctx)


def evaluate_array(expr: str, ctx: Mapping[str, Any]) -> list[Any]:
    if not expr:
        return []
    m = _BINDING.search(expr)
    inner = m.group(1).strip() if m else expr.lstrip("=").strip()
    value = _get_path(ctx, inner) if _SIMPLE_PATH.match(inner) else _evaluate_expr(inner, ctx)
    return list(value) if isinstance(value, list) else []


def evaluate_bool(expr: Any, ctx: Mapping[str, Any]) -> bool:
    """Evaluate a condition (e.g. an element's ``visibleIf``) to a boolean.

    Always routes through the expression parser: it resolves dotted/bracket
    paths *and* literals (true/false/null/numbers). A simple-path shortcut here
    would misread the literal keyword ``true`` as a context lookup.
    """
    if expr is None or expr == "":
        return True
    if not isinstance(expr, str):
        return _truthy(expr)
    src = expr[1:].strip() if expr.startswith("=") else expr.strip()
    return _truthy(_evaluate_expr(src, ctx))


def _format_number(num: float, decimals: int) -> str:
    """Grouped formatting identical to JS: comma thousands, dot decimal."""
    return f"{num:,.{decimals}f}"


def apply_format(value: Any, fmt: str | None) -> str:
    if value is None or value == "":
        return ""
    if not fmt:
        return _to_str(value)
    m = re.match(r"^\{0:([A-Za-z0-9]+)\}$", fmt)
    if m:
        spec = m.group(1)
        try:
            num = float(value)
        except (TypeError, ValueError):
            return _to_str(value)
        if spec == "C":
            return f"{_format_number(num, 2)} €"
        if spec == "P":
            return f"{math.floor(num * 100 + 0.5):d}%"
        if spec.startswith("N"):
            d = int(spec[1:]) if spec[1:] else 0
            return _format_number(num, d)
    if any(tok in fmt for tok in ("y", "M", "d", "H", "m", "s")):
        try:
            dt = value if isinstance(value, datetime) else datetime.fromisoformat(_to_str(value))
        except (TypeError, ValueError):
            return _to_str(value)
        return (
            fmt.replace("yyyy", f"{dt.year:04d}")
               .replace("MM", f"{dt.month:02d}")
               .replace("dd", f"{dt.day:02d}")
               .replace("HH", f"{dt.hour:02d}")
               .replace("mm", f"{dt.minute:02d}")
               .replace("ss", f"{dt.second:02d}")
        )
    return _to_str(value)
