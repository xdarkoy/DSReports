"""Pure-Python renderer: ReportDocument → PDF bytes.

Coordinates in the document are millimetres (origin top-left).  ReportLab's
canvas uses points (72pt = 1in) with origin bottom-left, so we translate.
"""
from __future__ import annotations

import io
import math
from datetime import datetime
from typing import Any, Mapping, Optional

from reportlab.lib.pagesizes import A3, A4, A5, LETTER, LEGAL, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdf_canvas

from .expression import apply_format, evaluate_array, evaluate_bool, evaluate_value, _to_str
from .image_policy import ImagePolicy, default_image_policy

PAGE_SIZES = {
    "A3": A3,
    "A4": A4,
    "A5": A5,
    "Letter": LETTER,
    "Legal": LEGAL,
}

# Bands rendered top-down from the page top, in order.
_FLOW_BANDS = ("pageHeader", "reportHeader", "body")
# Bands anchored to the page bottom, stacked upward (pageFooter sits lowest).
_BOTTOM_BANDS = ("pageFooter", "reportFooter")


def render_report_to_pdf(
    doc: Mapping[str, Any],
    data: Mapping[str, Any] | None = None,
    image_policy: Optional[ImagePolicy] = None,
) -> bytes:
    if not isinstance(doc, Mapping):
        raise ValueError("document must be a JSON object")

    policy = image_policy or default_image_policy()
    page = doc.get("page", {}) or {}
    size = PAGE_SIZES.get(page.get("size", "A4"), A4)
    if page.get("orientation") == "landscape":
        size = landscape(size)

    buf = io.BytesIO()
    c = pdf_canvas.Canvas(buf, pagesize=size)
    _page_w_pt, page_h_pt = size
    page_h_mm = page_h_pt / mm

    bands = doc.get("bands", []) or []
    base = data if data is not None else _extract_data(doc)
    base_ctx: dict = {
        **(base if isinstance(base, Mapping) else {}),
        "params": _resolve_parameters(doc),
    }

    # Plan pages: a single "detail" table in the body whose rows overflow its
    # area is split across pages (page header/footer repeat). Everything else
    # is one page. Grouped tables stay single-page for now.
    plan = _plan_pages(bands, base_ctx, page_h_mm)

    for i, pg in enumerate(plan):
        ctx: Mapping[str, Any] = {
            **base_ctx,
            **_system_fields(doc, page=i + 1, page_count=len(plan)),
        }
        _render_page(c, bands, pg, page_h_pt, page_h_mm, ctx, policy,
                     is_first=(i == 0), is_last=(i == len(plan) - 1))
        c.showPage()

    c.save()
    return buf.getvalue()


def _band_h(bands: list, kind: str) -> float:
    b = _band(bands, kind)
    return float(b.get("height", 0) or 0) if b else 0.0


def _table_footer_h(table: dict) -> float:
    """Height (mm) reserved for the table's own summary footer, if shown."""
    if not table.get("showFooter"):
        return 0.0
    return float(table.get("footerHeight") or table.get("rowHeight") or 7)


def _content_bottom_mm(bands: list, page_h_mm: float, table: dict) -> float:
    """Lowest Y (mm from page top) the paginating table may draw to. Reserves the
    page footer, report footer AND the table summary footer on EVERY page so the
    planned rows always fit and the summary footer never overflows the last page."""
    return (
        page_h_mm
        - _band_h(bands, "pageFooter")
        - _band_h(bands, "reportFooter")
        - _table_footer_h(table)
    )


def _plan_pages(bands: list, base_ctx: dict, page_h_mm: float) -> list[dict]:
    """Return a list of per-page plans. Each plan: {table, row_start, row_end, rows}.

    Only the first visible, non-grouped body table that overflows triggers pagination.
    """
    body = _band(bands, "body")
    single = [{"table": None, "row_start": 0, "row_end": 0, "rows": []}]
    if not body:
        return single

    ph_h = _band_h(bands, "pageHeader")
    rh_h = _band_h(bands, "reportHeader")

    # locate a paginating table
    table = None
    rows: list = []
    for el in body.get("elements", []):
        if el.get("type") != "table" or el.get("groupBy") or el.get("visible") is False:
            continue
        if not evaluate_bool(el.get("visibleIf"), base_ctx):
            continue
        tbl_ctx = {**base_ctx}
        erows = _shape_rows(evaluate_array(el.get("dataSource", ""), tbl_ctx), el, tbl_ctx)
        row_h = float(el.get("rowHeight") or 7)
        hdr_h = float(el.get("headerHeight") or 8) if el.get("showHeader", True) else 0.0
        top1 = ph_h + rh_h + float(el.get("bounds", {}).get("y", 0))
        cap1 = max(1, int((_content_bottom_mm(bands, page_h_mm, el) - top1 - hdr_h) // row_h))
        if len(erows) > cap1:
            table, rows = el, erows
            break

    if table is None:
        return single

    # build slices (plan and render share _content_bottom_mm so caps match exactly)
    row_h = float(table.get("rowHeight") or 7)
    hdr_h = float(table.get("headerHeight") or 8) if table.get("showHeader", True) else 0.0
    bottom = _content_bottom_mm(bands, page_h_mm, table)
    top1 = ph_h + rh_h + float(table.get("bounds", {}).get("y", 0))
    topN = ph_h  # continuation pages: table starts just below the page header
    cap1 = max(1, int((bottom - top1 - hdr_h) // row_h))
    capN = max(1, int((bottom - topN - hdr_h) // row_h))

    plan: list[dict] = []
    start = 0
    first = True
    while start < len(rows):
        end = min(len(rows), start + (cap1 if first else capN))
        plan.append({"table": table, "row_start": start, "row_end": end, "rows": rows})
        start = end
        first = False
    return plan or single


def _render_page(c, bands: list, pg: dict, page_h_pt: float, page_h_mm: float,
                 ctx: Mapping[str, Any], policy: ImagePolicy, *, is_first: bool, is_last: bool) -> None:
    ph_h = _band_h(bands, "pageHeader")
    rh_h = _band_h(bands, "reportHeader")
    pf_h = _band_h(bands, "pageFooter")
    rf_h = _band_h(bands, "reportFooter")
    paginating = pg.get("table") is not None

    # page header: every page
    header = _band(bands, "pageHeader")
    if header:
        _render_band(c, header, 0.0, page_h_pt, ctx, policy)

    # report header: first page only
    if is_first:
        rh = _band(bands, "reportHeader")
        if rh:
            _render_band(c, rh, ph_h, page_h_pt, ctx, policy)

    # body
    body = _band(bands, "body")
    if body:
        body_top = ph_h + rh_h
        table = pg.get("table")
        if not paginating:
            _render_band(c, body, body_top, page_h_pt, ctx, policy)
        else:
            # first page: render the non-paginating body elements at their
            # positions; continuation pages: only the continued table.
            if is_first:
                for el in body.get("elements", []):
                    if el is table:
                        continue
                    if el.get("visible") is False or not evaluate_bool(el.get("visibleIf"), ctx):
                        continue
                    _render_element(c, el, body_top, page_h_pt, ctx, policy)
                table_top = body_top + float(table.get("bounds", {}).get("y", 0))
            else:
                table_top = ph_h
            # Same bottom as the planner used, so the rendered row window never
            # under/overfills a page.
            bottom_mm = _content_bottom_mm(bands, page_h_mm, table)
            _render_table_window(c, table, table_top, bottom_mm, page_h_pt, ctx,
                                  pg["rows"], pg["row_start"], pg["row_end"], draw_footer=is_last)

    # report footer: last page only
    if is_last:
        rf = _band(bands, "reportFooter")
        if rf:
            _render_band(c, rf, page_h_mm - pf_h - rf_h, page_h_pt, ctx, policy)

    # page footer: every page
    footer = _band(bands, "pageFooter")
    if footer:
        _render_band(c, footer, page_h_mm - pf_h, page_h_pt, ctx, policy)


# ---------------------------------------------------------------------------


def _band(bands: list[dict], kind: str) -> dict | None:
    return next((b for b in bands if b.get("type") == kind), None)


def _render_band(
    c: pdf_canvas.Canvas, band: dict, band_top_mm: float, page_h_pt: float,
    ctx: Mapping[str, Any], policy: ImagePolicy,
) -> None:
    for el in band.get("elements", []):
        if el.get("visible") is False:
            continue
        if not evaluate_bool(el.get("visibleIf"), ctx):
            continue
        _render_element(c, el, band_top_mm, page_h_pt, ctx, policy)


def _render_element(
    c: pdf_canvas.Canvas, el: dict, band_top_mm: float, page_h_pt: float,
    ctx: Mapping[str, Any], policy: ImagePolicy,
) -> None:
    b = el["bounds"]
    x_pt = b["x"] * mm
    w_pt = b["width"] * mm
    h_pt = b["height"] * mm
    # Flip Y: document Y=0 is top, ReportLab Y=0 is bottom.
    y_pt = page_h_pt - (band_top_mm + b["y"] + b["height"]) * mm

    kind = el.get("type")
    if kind == "text":
        _text(c, el, x_pt, y_pt, w_pt, h_pt, ctx)
    elif kind == "image":
        _image(c, el, x_pt, y_pt, w_pt, h_pt, ctx, policy)
    elif kind == "rectangle":
        _rect(c, el, x_pt, y_pt, w_pt, h_pt)
    elif kind == "line":
        _line(c, el, x_pt, y_pt, w_pt, h_pt)
    elif kind == "barcode":
        _barcode(c, el, x_pt, y_pt, w_pt, h_pt, ctx)
    elif kind == "table":
        _table(c, el, x_pt, y_pt, w_pt, h_pt, ctx)
    elif kind == "crosstab":
        _crosstab(c, el, x_pt, y_pt, w_pt, h_pt, ctx)
    elif kind == "chart":
        # Charts are out of scope for the baseline renderer; draw a placeholder.
        c.saveState()
        c.setFillColorRGB(0.9, 0.9, 0.95)
        c.rect(x_pt, y_pt, w_pt, h_pt, fill=1, stroke=0)
        c.setFillColorRGB(0.3, 0.3, 0.3)
        c.drawString(x_pt + 4, y_pt + h_pt - 14, f"[chart:{el.get('kind','bar')}]")
        c.restoreState()


def _text(c: pdf_canvas.Canvas, el: dict, x: float, y: float, w: float, h: float, ctx: Mapping[str, Any]) -> None:
    style = _merge_conditional(el.get("style") or {}, el.get("conditional"), ctx)
    value = apply_format(evaluate_value(el.get("value", ""), ctx), el.get("format"))
    font_name = _font(style)
    font_size = float(style.get("fontSize") or 10)
    color = _hex(style.get("color") or "#111827")

    c.saveState()
    bg = style.get("backgroundColor")
    if bg:
        c.setFillColorRGB(*_hex(bg))
        c.rect(x, y, w, h, fill=1, stroke=0)
    if style.get("borderWidth"):
        c.setStrokeColorRGB(*_hex(style.get("borderColor") or "#111827"))
        c.setLineWidth(float(style["borderWidth"]) * mm)
        c.rect(x, y, w, h, fill=0, stroke=1)

    c.setFillColorRGB(*color)
    c.setFont(font_name, font_size)
    align = style.get("horizontalAlign") or "left"
    baseline_y = y + h - font_size
    if align == "center":
        c.drawCentredString(x + w / 2, baseline_y, value or "")
    elif align == "right":
        c.drawRightString(x + w - 2, baseline_y, value or "")
    else:
        c.drawString(x + 2, baseline_y, value or "")
    c.restoreState()


def _image(c: pdf_canvas.Canvas, el: dict, x: float, y: float, w: float, h: float, ctx: Mapping[str, Any], policy: ImagePolicy) -> None:
    src = evaluate_value(el.get("source") or "", ctx)
    if not src:
        return
    raw = policy.load(src)  # None for disallowed/local/unfetchable sources
    if raw is not None:
        try:
            from reportlab.lib.utils import ImageReader
            img = ImageReader(io.BytesIO(raw))
            c.drawImage(img, x, y, width=w, height=h, preserveAspectRatio=(el.get("fit") == "contain"), mask="auto")
            return
        except Exception:
            pass
    # Placeholder for missing / disallowed images.
    c.saveState()
    c.setFillColorRGB(0.9, 0.9, 0.9)
    c.rect(x, y, w, h, fill=1, stroke=0)
    c.restoreState()


def _rect(c: pdf_canvas.Canvas, el: dict, x: float, y: float, w: float, h: float) -> None:
    style = el.get("style") or {}
    c.saveState()
    if style.get("backgroundColor"):
        c.setFillColorRGB(*_hex(style["backgroundColor"]))
    c.setStrokeColorRGB(*_hex(style.get("borderColor") or "#111827"))
    c.setLineWidth(float(style.get("borderWidth") or 0.3) * mm)
    c.rect(x, y, w, h, fill=bool(style.get("backgroundColor")), stroke=1)
    c.restoreState()


def _line(c: pdf_canvas.Canvas, el: dict, x: float, y: float, w: float, h: float) -> None:
    c.saveState()
    c.setStrokeColorRGB(*_hex(el.get("color") or "#111827"))
    c.setLineWidth(float(el.get("width") or 0.3) * mm)
    direction = el.get("direction") or "horizontal"
    if direction == "vertical":
        c.line(x, y, x, y + h)
    else:
        c.line(x, y + h / 2, x + w, y + h / 2)
    c.restoreState()


def _barcode(c: pdf_canvas.Canvas, el: dict, x: float, y: float, w: float, h: float, ctx: Mapping[str, Any]) -> None:
    value = evaluate_value(el.get("value", ""), ctx)
    symbology = el.get("symbology") or "code128"
    try:
        if symbology == "qrcode":
            import qrcode
            img = qrcode.make(value)
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            from reportlab.lib.utils import ImageReader
            c.drawImage(ImageReader(buf), x, y, width=h, height=h)
        else:
            from barcode import get
            from barcode.writer import ImageWriter
            code = get(symbology, value, writer=ImageWriter())
            buf = io.BytesIO()
            code.write(buf, options={"write_text": bool(el.get("showText", True))})
            buf.seek(0)
            from reportlab.lib.utils import ImageReader
            c.drawImage(ImageReader(buf), x, y, width=w, height=h)
    except Exception:
        c.saveState()
        c.setFillColorRGB(0.95, 0.95, 0.95)
        c.rect(x, y, w, h, fill=1, stroke=0)
        c.setFillColorRGB(0, 0, 0)
        c.setFont("Helvetica", 7)
        c.drawCentredString(x + w / 2, y + 2, f"[barcode:{symbology}] {value}")
        c.restoreState()


def _table(c: pdf_canvas.Canvas, el: dict, x: float, y: float, w: float, h: float, ctx: Mapping[str, Any]) -> None:
    columns = el.get("columns", [])
    if not columns:
        return
    rows = _shape_rows(evaluate_array(el.get("dataSource", ""), ctx), el, ctx)
    col_total = sum(col.get("width", 10) for col in columns) or 1
    header_h_pt = (el.get("headerHeight") or 8) * mm
    row_h_pt = (el.get("rowHeight") or 7) * mm
    show_header = el.get("showHeader", True)

    c.saveState()
    y_top = y + h
    cur_x = x
    col_widths = [(col.get("width", 10) / col_total) * w for col in columns]

    # header
    if show_header:
        c.setFillColorRGB(0.95, 0.95, 0.95)
        c.rect(x, y_top - header_h_pt, w, header_h_pt, fill=1, stroke=0)
        c.setFillColorRGB(0.07, 0.09, 0.15)
        c.setFont("Helvetica-Bold", 9)
        for i, col in enumerate(columns):
            c.drawString(cur_x + 3, y_top - header_h_pt + 3, str(evaluate_value(col.get("header", ""), ctx)))
            cur_x += col_widths[i]
        y_top -= header_h_pt

    # rows (with optional Crystal-style grouping + per-group subtotals)
    running: dict = {}
    group_by = el.get("groupBy")
    idx = 0
    stopped = False
    for gkey, grows in _group_rows(rows, group_by):
        if stopped:
            break
        # group header
        if group_by and el.get("groupHeader") is not None:
            if y_top - row_h_pt < y:
                break
            c.setFillColorRGB(0.93, 0.94, 1.0)
            c.rect(x, y_top - row_h_pt, w, row_h_pt, fill=1, stroke=0)
            c.setFillColorRGB(0.07, 0.09, 0.15)
            c.setFont("Helvetica-Bold", 9)
            gh = evaluate_value(el.get("groupHeader"), {**ctx, "group": gkey, "GroupCount": len(grows)})
            c.drawString(x + 3, y_top - row_h_pt + 3, str(gh))
            y_top -= row_h_pt
        # data rows
        for row in grows:
            if y_top - row_h_pt < y:
                stopped = True
                break
            if idx % 2 == 1 and el.get("alternateRowColor"):
                c.setFillColorRGB(*_hex(el["alternateRowColor"]))
                c.rect(x, y_top - row_h_pt, w, row_h_pt, fill=1, stroke=0)
            cur_x = x
            for i, col in enumerate(columns):
                cell_ctx = {**ctx, "row": row, "RowNumber": idx + 1}
                cstyle = _merge_conditional(col.get("cellStyle") or {}, col.get("conditional"), cell_ctx)
                bg = cstyle.get("backgroundColor")
                if bg:
                    c.setFillColorRGB(*_hex(bg))
                    c.rect(cur_x, y_top - row_h_pt, col_widths[i], row_h_pt, fill=1, stroke=0)
                if col.get("runningTotal"):
                    key = col.get("id", i)
                    try:
                        running[key] = running.get(key, 0.0) + float(evaluate_value(col.get("cell", ""), cell_ctx))
                    except (TypeError, ValueError):
                        pass
                    value = apply_format(running.get(key, 0.0), col.get("format"))
                else:
                    value = apply_format(evaluate_value(col.get("cell", ""), cell_ctx), col.get("format"))
                c.setFillColorRGB(*_hex(cstyle.get("color") or "#111827"))
                c.setFont(_font(cstyle), float(cstyle.get("fontSize") or 9))
                c.drawString(cur_x + 3, y_top - row_h_pt + 3, str(value))
                cur_x += col_widths[i]
            y_top -= row_h_pt
            idx += 1
        # per-group subtotal row
        if not stopped and group_by and el.get("showGroupFooter") and y_top - row_h_pt >= y:
            c.setFillColorRGB(0.95, 0.96, 0.98)
            c.rect(x, y_top - row_h_pt, w, row_h_pt, fill=1, stroke=0)
            c.setFillColorRGB(0.07, 0.09, 0.15)
            c.setFont("Helvetica-Bold", 9)
            cur_x = x
            for i, col in enumerate(columns):
                if col.get("summary"):
                    vals = []
                    for r in grows:
                        try:
                            vals.append(float(evaluate_value(col.get("cell", ""), {**ctx, "row": r})))
                        except (TypeError, ValueError):
                            pass
                    c.drawString(cur_x + 3, y_top - row_h_pt + 3,
                                 apply_format(_aggregate(col["summary"], vals, len(grows)), col.get("format")))
                cur_x += col_widths[i]
            y_top -= row_h_pt

    # footer / summary row (Crystal-style summary fields)
    if el.get("showFooter"):
        footer_h_pt = (el.get("footerHeight") or el.get("rowHeight") or 7) * mm
        c.setFillColorRGB(0.93, 0.93, 0.96)
        c.rect(x, y_top - footer_h_pt, w, footer_h_pt, fill=1, stroke=0)
        c.setStrokeColorRGB(0.27, 0.27, 0.27)
        c.setLineWidth(0.6)
        c.line(x, y_top, x + w, y_top)
        c.setFillColorRGB(0.07, 0.09, 0.15)
        c.setFont("Helvetica-Bold", 9)
        cur_x = x
        for i, col in enumerate(columns):
            c.drawString(cur_x + 3, y_top - footer_h_pt + 3, _footer_cell(col, rows, ctx))
            cur_x += col_widths[i]
        y_top -= footer_h_pt

    c.setStrokeColorRGB(0.85, 0.85, 0.88)
    c.setLineWidth(0.3)
    c.rect(x, y, w, h, fill=0, stroke=1)
    c.restoreState()


def _pivot(rows: list, row_field: str, col_field: str, val_field: str, agg: str):
    """Compute a cross-tab matrix. Mirrors packages/designer/src/utils/pivot.ts."""
    row_keys: list = []
    col_keys: list = []
    rseen: set = set()
    cseen: set = set()
    buckets: dict = {}
    for row in rows:
        rec = row if isinstance(row, Mapping) else {}
        r = _to_str(rec.get(row_field))
        col = _to_str(rec.get(col_field))
        try:
            v = float(rec.get(val_field))
        except (TypeError, ValueError):
            v = math.nan
        if r not in rseen:
            rseen.add(r)
            row_keys.append(r)
        if col not in cseen:
            cseen.add(col)
            col_keys.append(col)
        buckets.setdefault((r, col), []).append(v)
    cells: dict = {}
    row_totals: dict = {}
    col_totals = {c: 0.0 for c in col_keys}
    grand = 0.0
    for r in row_keys:
        cells[r] = {}
        row_totals[r] = 0.0
        for col in col_keys:
            vals = buckets.get((r, col), [])
            val = _aggregate(agg, [v for v in vals if not math.isnan(v)] if agg != "count" else vals, len(vals)) if vals else 0.0
            cells[r][col] = val
            row_totals[r] += val
            col_totals[col] += val
            grand += val
    return row_keys, col_keys, cells, row_totals, col_totals, grand


def _crosstab(c: pdf_canvas.Canvas, el: dict, x: float, y: float, w: float, h: float, ctx: Mapping[str, Any]) -> None:
    rows = evaluate_array(el.get("dataSource", ""), ctx)
    row_keys, col_keys, cells, row_totals, col_totals, grand = _pivot(
        rows, el.get("rowField", ""), el.get("columnField", ""), el.get("valueField", ""), el.get("aggregate", "sum"),
    )
    show_rt = el.get("showRowTotals", True)
    show_ct = el.get("showColumnTotals", True)
    fmt = el.get("format")
    ncols = 1 + len(col_keys) + (1 if show_rt else 0)
    nrows = 1 + len(row_keys) + (1 if show_ct else 0)
    if ncols < 1 or nrows < 1:
        return
    cw = w / ncols
    ch = h / nrows

    def cell_text(cx, cy, text, *, bold=False, align="right", header=False):
        if header:
            c.setFillColorRGB(0.93, 0.94, 0.97)
            c.rect(cx, cy, cw, ch, fill=1, stroke=0)
        c.setStrokeColorRGB(0.85, 0.85, 0.88)
        c.setLineWidth(0.3)
        c.rect(cx, cy, cw, ch, fill=0, stroke=1)
        c.setFillColorRGB(0.07, 0.09, 0.15)
        c.setFont("Helvetica-Bold" if (bold or header) else "Helvetica", 8)
        s = str(text)
        if align == "right":
            c.drawRightString(cx + cw - 3, cy + ch / 2 - 3, s)
        else:
            c.drawString(cx + 3, cy + ch / 2 - 3, s)

    c.saveState()
    top = y + h
    # header row
    cell_text(x, top - ch, f"{el.get('rowField','')}\\{el.get('columnField','')}", header=True, align="left")
    for j, ck in enumerate(col_keys):
        cell_text(x + (1 + j) * cw, top - ch, ck, header=True)
    if show_rt:
        cell_text(x + (ncols - 1) * cw, top - ch, "Σ", header=True)
    # body rows
    for i, rk in enumerate(row_keys):
        ry = top - (2 + i) * ch
        cell_text(x, ry, rk, header=True, align="left")
        for j, ck in enumerate(col_keys):
            cell_text(x + (1 + j) * cw, ry, apply_format(cells[rk][ck], fmt))
        if show_rt:
            cell_text(x + (ncols - 1) * cw, ry, apply_format(row_totals[rk], fmt), bold=True)
    # totals row
    if show_ct:
        ty = top - (1 + len(row_keys) + 1) * ch
        cell_text(x, ty, "Σ", header=True, align="left")
        for j, ck in enumerate(col_keys):
            cell_text(x + (1 + j) * cw, ty, apply_format(col_totals[ck], fmt), bold=True)
        if show_rt:
            cell_text(x + (ncols - 1) * cw, ty, apply_format(grand, fmt), bold=True)
    c.restoreState()


def _render_table_window(
    c: pdf_canvas.Canvas, el: dict, table_top_mm: float, bottom_mm: float, page_h_pt: float,
    ctx: Mapping[str, Any], rows: list, start: int, end: int, *, draw_footer: bool,
) -> None:
    """Render a pre-shaped table over the row window [start:end], repeating the
    column header. Used by the paginated render path. Running totals accumulate
    from row 0 (so they stay correct across page boundaries)."""
    columns = el.get("columns", [])
    if not columns:
        return
    b = el.get("bounds", {})
    x = float(b.get("x", 0)) * mm
    w = float(b.get("width", 0)) * mm
    col_total = sum(col.get("width", 10) for col in columns) or 1
    col_widths = [(col.get("width", 10) / col_total) * w for col in columns]
    row_h_pt = float(el.get("rowHeight") or 7) * mm
    hdr_h_pt = float(el.get("headerHeight") or 8) * mm if el.get("showHeader", True) else 0.0
    y_top = page_h_pt - table_top_mm * mm
    y_top_initial = y_top
    y_limit = page_h_pt - bottom_mm * mm
    fit_eps = 0.5  # pt: guard against float drift dropping a planned row

    c.saveState()
    # header
    if el.get("showHeader", True):
        c.setFillColorRGB(0.95, 0.95, 0.95)
        c.rect(x, y_top - hdr_h_pt, w, hdr_h_pt, fill=1, stroke=0)
        c.setFillColorRGB(0.07, 0.09, 0.15)
        c.setFont("Helvetica-Bold", 9)
        cur_x = x
        for i, col in enumerate(columns):
            c.drawString(cur_x + 3, y_top - hdr_h_pt + 3, str(evaluate_value(col.get("header", ""), ctx)))
            cur_x += col_widths[i]
        y_top -= hdr_h_pt

    # seed running totals with rows before this window (key falls back to the
    # column index when no explicit id, matching the single-page _table)
    running: dict = {}
    for i, col in enumerate(columns):
        if col.get("runningTotal"):
            key = col.get("id", i)
            acc = 0.0
            for r in rows[:start]:
                try:
                    acc += float(evaluate_value(col.get("cell", ""), {**ctx, "row": r}))
                except (TypeError, ValueError):
                    pass
            running[key] = acc

    # rows in this window
    for idx in range(start, end):
        if y_top - row_h_pt < y_limit - fit_eps:
            break
        row = rows[idx]
        if idx % 2 == 1 and el.get("alternateRowColor"):
            c.setFillColorRGB(*_hex(el["alternateRowColor"]))
            c.rect(x, y_top - row_h_pt, w, row_h_pt, fill=1, stroke=0)
        cur_x = x
        for i, col in enumerate(columns):
            cell_ctx = {**ctx, "row": row, "RowNumber": idx + 1}
            cstyle = _merge_conditional(col.get("cellStyle") or {}, col.get("conditional"), cell_ctx)
            bg = cstyle.get("backgroundColor")
            if bg:
                c.setFillColorRGB(*_hex(bg))
                c.rect(cur_x, y_top - row_h_pt, col_widths[i], row_h_pt, fill=1, stroke=0)
            if col.get("runningTotal"):
                key = col.get("id", i)
                try:
                    running[key] = running.get(key, 0.0) + float(evaluate_value(col.get("cell", ""), cell_ctx))
                except (TypeError, ValueError):
                    pass
                value = apply_format(running.get(key, 0.0), col.get("format"))
            else:
                value = apply_format(evaluate_value(col.get("cell", ""), cell_ctx), col.get("format"))
            c.setFillColorRGB(*_hex(cstyle.get("color") or "#111827"))
            c.setFont(_font(cstyle), float(cstyle.get("fontSize") or 9))
            c.drawString(cur_x + 3, y_top - row_h_pt + 3, str(value))
            cur_x += col_widths[i]
        y_top -= row_h_pt

    # grand total / summary footer on the last page (space is reserved by the
    # planner via _content_bottom_mm, so it always fits)
    if draw_footer and el.get("showFooter"):
        footer_h_pt = float(el.get("footerHeight") or el.get("rowHeight") or 7) * mm
        c.setFillColorRGB(0.93, 0.93, 0.96)
        c.rect(x, y_top - footer_h_pt, w, footer_h_pt, fill=1, stroke=0)
        c.setStrokeColorRGB(0.27, 0.27, 0.27)
        c.setLineWidth(0.6)
        c.line(x, y_top, x + w, y_top)
        c.setFillColorRGB(0.07, 0.09, 0.15)
        c.setFont("Helvetica-Bold", 9)
        cur_x = x
        for i, col in enumerate(columns):
            c.drawString(cur_x + 3, y_top - footer_h_pt + 3, _footer_cell(col, rows, ctx))
            cur_x += col_widths[i]
        y_top -= footer_h_pt

    # outer border around the content drawn on this page (matches single-page _table)
    c.setStrokeColorRGB(0.85, 0.85, 0.88)
    c.setLineWidth(0.3)
    c.rect(x, y_top, w, y_top_initial - y_top, fill=0, stroke=1)
    c.restoreState()


def _merge_conditional(base: Mapping[str, Any], rules: Any, ctx: Mapping[str, Any]) -> dict:
    """Apply conditional-formatting rules over a base style (Crystal Highlighting)."""
    style = dict(base or {})
    for r in rules or []:
        when = r.get("when") if isinstance(r, Mapping) else None
        if when and evaluate_bool(when, ctx):
            style.update(r.get("style") or {})
    return style


def _sort_key(v: Any) -> tuple:
    if v is None:
        return (0, 0.0, "")
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return (1, float(v), "")
    return (2, 0.0, str(v))


def _shape_rows(rows: list, el: dict, ctx: Mapping[str, Any]) -> list:
    """Filter (record selection) and sort table rows."""
    out = list(rows)
    flt = el.get("filter")
    if flt:
        out = [r for r in out if evaluate_bool(flt, {**ctx, "row": r})]
    for s in reversed(el.get("sort") or []):
        field = s.get("field")
        desc = s.get("dir") == "desc"
        out.sort(key=lambda r: _sort_key(r.get(field) if isinstance(r, Mapping) else None), reverse=desc)
    return out


def _group_rows(rows: list, field: Any) -> list:
    """Group rows by a field, preserving first-appearance order."""
    if not field:
        return [(None, rows)]
    order: list = []
    groups: dict = {}
    for r in rows:
        key = r.get(field) if isinstance(r, Mapping) else None
        k = str(key)
        if k not in groups:
            groups[k] = (key, [])
            order.append(k)
        groups[k][1].append(r)
    return [groups[k] for k in order]


def _footer_cell(col: dict, rows: list, ctx: Mapping[str, Any]) -> str:
    summary = col.get("summary")
    if summary:
        values = []
        for row in rows:
            raw = evaluate_value(col.get("cell", ""), {**ctx, "row": row})
            try:
                values.append(float(raw))
            except (TypeError, ValueError):
                pass
        return apply_format(_aggregate(summary, values, len(rows)), col.get("format"))
    footer = col.get("footer")
    if footer:
        return apply_format(evaluate_value(footer, ctx), col.get("format"))
    return ""


def _aggregate(func: str, values: list[float], row_count: int) -> float:
    if func == "count":
        return row_count
    if not values:
        return 0
    if func == "sum":
        return sum(values)
    if func == "avg":
        return sum(values) / len(values)
    if func == "min":
        return min(values)
    if func == "max":
        return max(values)
    return 0


def _resolve_parameters(doc: Mapping[str, Any]) -> dict:
    """Map report parameters to {name: value} for {{params.name}} bindings."""
    out: dict = {}
    for p in doc.get("parameters", []) or []:
        if not isinstance(p, Mapping):
            continue
        v = p.get("defaultValue")
        t = p.get("type")
        if t == "number" and v not in (None, ""):
            try:
                v = float(v)
            except (TypeError, ValueError):
                pass
        elif t == "boolean":
            v = v is True or v == "true"
        out[p.get("name")] = v
    return out


def _system_fields(doc: Mapping[str, Any], page: int = 1, page_count: int = 1) -> dict:
    """Crystal-style special fields: {{Page}}, {{PageCount}}, {{PrintDate}}, …"""
    now = datetime.now()
    title = ""
    meta = doc.get("meta")
    if isinstance(meta, Mapping):
        title = meta.get("title") or ""
    return {
        "Page": page,
        "PageCount": page_count,
        "PageNofM": f"{page} / {page_count}",
        "PrintDate": now.strftime("%Y-%m-%d"),
        "PrintTime": now.strftime("%H:%M"),
        "ReportTitle": title,
    }


def _extract_data(doc: Mapping[str, Any]) -> dict:
    """Fall back to the first datasource's sample payload when no data is posted."""
    for ds in doc.get("dataSources", []):
        if ds.get("sample") is not None:
            return ds["sample"]
    return {}


def _font(style: Mapping[str, Any]) -> str:
    weight = style.get("fontWeight")
    italic = style.get("fontStyle") == "italic"
    bold = weight == "bold" or (isinstance(weight, (int, float)) and int(weight) >= 600)
    if bold and italic:
        return "Helvetica-BoldOblique"
    if bold:
        return "Helvetica-Bold"
    if italic:
        return "Helvetica-Oblique"
    return "Helvetica"


# A few common CSS color names so AI-generated styles don't crash the render.
_NAMED_COLORS: dict[str, tuple[float, float, float]] = {
    "black": (0, 0, 0), "white": (1, 1, 1), "red": (1, 0, 0), "green": (0, 0.5, 0),
    "blue": (0, 0, 1), "gray": (0.5, 0.5, 0.5), "grey": (0.5, 0.5, 0.5),
    "yellow": (1, 1, 0), "orange": (1, 0.65, 0), "transparent": (1, 1, 1),
}


def _hex(h: Any, fallback: tuple[float, float, float] = (0, 0, 0)) -> tuple[float, float, float]:
    """Parse a #hex / #rgb / named color. Returns ``fallback`` on anything
    unparseable so a bad color never aborts the whole render."""
    if not isinstance(h, str):
        return fallback
    name = h.strip().lower()
    if name in _NAMED_COLORS:
        return _NAMED_COLORS[name]
    s = name.lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    if len(s) != 6:
        return fallback
    try:
        return (int(s[0:2], 16) / 255, int(s[2:4], 16) / 255, int(s[4:6], 16) / 255)
    except ValueError:
        return fallback
