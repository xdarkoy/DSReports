"""Pure-Python renderer: ReportDocument → PDF bytes.

Coordinates in the document are millimetres (origin top-left).  ReportLab's
canvas uses points (72pt = 1in) with origin bottom-left, so we translate.
"""
from __future__ import annotations

import base64
import io
from typing import Any, Mapping

from reportlab.lib.pagesizes import A3, A4, A5, LETTER, LEGAL, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdf_canvas

from .expression import apply_format, evaluate_array, evaluate_value

PAGE_SIZES = {
    "A3": A3,
    "A4": A4,
    "A5": A5,
    "Letter": LETTER,
    "Legal": LEGAL,
}


def render_report_to_pdf(doc: Mapping[str, Any], data: Mapping[str, Any] | None = None) -> bytes:
    page = doc.get("page", {})
    size = PAGE_SIZES.get(page.get("size", "A4"), A4)
    if page.get("orientation") == "landscape":
        size = landscape(size)

    buf = io.BytesIO()
    c = pdf_canvas.Canvas(buf, pagesize=size)
    page_w_pt, page_h_pt = size

    bands = doc.get("bands", [])
    header_h = _h(bands, "pageHeader")
    footer_h = _h(bands, "pageFooter")

    y_cursor_mm = 0
    ctx: Mapping[str, Any] = data or _extract_data(doc)

    # Page header
    header = _band(bands, "pageHeader")
    if header:
        _render_band(c, header, 0, page_h_pt, ctx)
        y_cursor_mm += header.get("height", 0)

    # Body (single page for now; paging across bodies is a future extension)
    body = _band(bands, "body")
    if body:
        _render_band(c, body, y_cursor_mm, page_h_pt, ctx)

    # Footer
    footer = _band(bands, "pageFooter")
    if footer:
        _render_band(c, footer, (page_h_pt / mm) - footer.get("height", 0), page_h_pt, ctx)

    c.showPage()
    c.save()
    return buf.getvalue()


# ---------------------------------------------------------------------------


def _band(bands: list[dict], kind: str) -> dict | None:
    return next((b for b in bands if b.get("type") == kind), None)


def _h(bands: list[dict], kind: str) -> float:
    b = _band(bands, kind)
    return float(b["height"]) if b else 0


def _render_band(c: pdf_canvas.Canvas, band: dict, band_top_mm: float, page_h_pt: float, ctx: Mapping[str, Any]) -> None:
    for el in band.get("elements", []):
        if el.get("visible") is False:
            continue
        _render_element(c, el, band_top_mm, page_h_pt, ctx)


def _render_element(c: pdf_canvas.Canvas, el: dict, band_top_mm: float, page_h_pt: float, ctx: Mapping[str, Any]) -> None:
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
        _image(c, el, x_pt, y_pt, w_pt, h_pt, ctx)
    elif kind == "rectangle":
        _rect(c, el, x_pt, y_pt, w_pt, h_pt)
    elif kind == "line":
        _line(c, el, x_pt, y_pt, w_pt, h_pt)
    elif kind == "barcode":
        _barcode(c, el, x_pt, y_pt, w_pt, h_pt, ctx)
    elif kind == "table":
        _table(c, el, x_pt, y_pt, w_pt, h_pt, ctx)
    elif kind == "chart":
        # Charts are out of scope for the baseline renderer; draw a placeholder.
        c.saveState()
        c.setFillColorRGB(0.9, 0.9, 0.95)
        c.rect(x_pt, y_pt, w_pt, h_pt, fill=1, stroke=0)
        c.setFillColorRGB(0.3, 0.3, 0.3)
        c.drawString(x_pt + 4, y_pt + h_pt - 14, f"[chart:{el.get('kind','bar')}]")
        c.restoreState()


def _text(c: pdf_canvas.Canvas, el: dict, x: float, y: float, w: float, h: float, ctx: Mapping[str, Any]) -> None:
    style = el.get("style") or {}
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


def _image(c: pdf_canvas.Canvas, el: dict, x: float, y: float, w: float, h: float, ctx: Mapping[str, Any]) -> None:
    src = evaluate_value(el.get("source") or "", ctx)
    if not src:
        return
    try:
        if src.startswith("data:"):
            header, b64 = src.split(",", 1)
            raw = base64.b64decode(b64)
            from reportlab.lib.utils import ImageReader
            img = ImageReader(io.BytesIO(raw))
            c.drawImage(img, x, y, width=w, height=h, preserveAspectRatio=(el.get("fit") == "contain"), mask="auto")
        else:
            c.drawImage(src, x, y, width=w, height=h, preserveAspectRatio=(el.get("fit") == "contain"), mask="auto")
    except Exception:
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
    rows = evaluate_array(el.get("dataSource", ""), ctx)
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

    # rows
    c.setFont("Helvetica", 9)
    for idx, row in enumerate(rows):
        if y_top - row_h_pt < y:
            break  # no pagination in baseline
        if idx % 2 == 1 and el.get("alternateRowColor"):
            c.setFillColorRGB(*_hex(el["alternateRowColor"]))
            c.rect(x, y_top - row_h_pt, w, row_h_pt, fill=1, stroke=0)
            c.setFillColorRGB(0.07, 0.09, 0.15)
        cur_x = x
        for i, col in enumerate(columns):
            value = apply_format(
                evaluate_value(col.get("cell", ""), {**ctx, "row": row}),
                col.get("format"),
            )
            c.drawString(cur_x + 3, y_top - row_h_pt + 3, str(value))
            cur_x += col_widths[i]
        y_top -= row_h_pt

    c.setStrokeColorRGB(0.85, 0.85, 0.88)
    c.setLineWidth(0.3)
    c.rect(x, y, w, h, fill=0, stroke=1)
    c.restoreState()


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


def _hex(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    r = int(h[0:2], 16) / 255
    g = int(h[2:4], 16) / 255
    b = int(h[4:6], 16) / 255
    return (r, g, b)
