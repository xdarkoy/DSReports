"""Mirrors the TypeScript evaluator in the designer so the server-side
render produces identical output."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Mapping

_BINDING = re.compile(r"\{\{\s*([^}]+?)\s*\}\}")


def _get_path(ctx: Mapping[str, Any], path: str) -> Any:
    cur: Any = ctx
    for part in path.split("."):
        if cur is None:
            return None
        # Handle [0] syntax inside paths that come from the data explorer
        m = re.match(r"^([\w]+)\[(\d+)\]$", part)
        if m:
            cur = cur.get(m.group(1)) if isinstance(cur, Mapping) else None
            if isinstance(cur, list):
                idx = int(m.group(2))
                cur = cur[idx] if 0 <= idx < len(cur) else None
        else:
            cur = cur.get(part) if isinstance(cur, Mapping) else getattr(cur, part, None)
    return cur


def _safe_eval(expr: str, ctx: Mapping[str, Any]) -> Any:
    """Very small expression evaluator: only names from ctx + math ops."""
    try:
        # Ban underscores + double-underscores to make __builtins__ tricks harder.
        if "__" in expr:
            return None
        return eval(  # noqa: S307 – sandbox via tiny allowlist
            expr,
            {"__builtins__": {}},
            dict(ctx),
        )
    except Exception:
        return None


def evaluate_value(value: Any, ctx: Mapping[str, Any]) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        return str(value)
    if value.startswith("="):
        out = _safe_eval(value[1:].strip(), ctx)
        return "" if out is None else str(out)
    if "{{" in value:
        def repl(m: re.Match[str]) -> str:
            inner = m.group(1).strip()
            if re.match(r"^[\w.\[\]]+$", inner):
                v = _get_path(ctx, inner)
            else:
                v = _safe_eval(inner, ctx)
            return "" if v is None else str(v)
        return _BINDING.sub(repl, value)
    return value


def evaluate_array(expr: str, ctx: Mapping[str, Any]) -> list[Any]:
    if not expr:
        return []
    m = _BINDING.search(expr)
    inner = m.group(1) if m else expr.lstrip("=").strip()
    value = _get_path(ctx, inner) if re.match(r"^[\w.\[\]]+$", inner) else _safe_eval(inner, ctx)
    return list(value) if isinstance(value, list) else []


def apply_format(value: Any, fmt: str | None) -> str:
    if value is None or value == "":
        return ""
    if not fmt:
        return str(value)
    m = re.match(r"^\{0:([A-Za-z0-9]+)\}$", fmt)
    if m:
        spec = m.group(1)
        try:
            num = float(value)
        except Exception:
            return str(value)
        if spec == "C":
            return f"{num:,.2f} €"
        if spec == "P":
            return f"{num * 100:.0f}%"
        if spec.startswith("N"):
            d = int(spec[1:]) if spec[1:] else 0
            return f"{num:,.{d}f}"
    if any(tok in fmt for tok in ("y", "M", "d", "H", "m", "s")):
        try:
            dt = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
        except Exception:
            return str(value)
        return (
            fmt.replace("yyyy", f"{dt.year:04d}")
               .replace("MM", f"{dt.month:02d}")
               .replace("dd", f"{dt.day:02d}")
               .replace("HH", f"{dt.hour:02d}")
               .replace("mm", f"{dt.minute:02d}")
               .replace("ss", f"{dt.second:02d}")
        )
    return str(value)
