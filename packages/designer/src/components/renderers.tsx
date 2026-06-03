import type {
  BarcodeElement,
  ChartElement,
  CrossTabElement,
  ImageElement,
  LineElement,
  PageBreakElement,
  RectangleElement,
  ReportElement,
  SubReportElement,
  TableColumn,
  TableElement,
  TextElement,
} from "@xdarkoy/schema";
import { applyFormat, evaluateArray, evaluateValue, evaluateCondition, resolveBinding } from "../utils/expression";
import { aggregate } from "../utils/reportFields";
import { mergeConditional } from "../utils/conditional";
import { shapeRows, groupRows } from "../utils/tableData";
import { pivot } from "../utils/pivot";

export function renderElement(el: ReportElement, data: Record<string, unknown>, pxPerMm: number): JSX.Element {
  switch (el.type) {
    case "text": return <TextR el={el} data={data} />;
    case "image": return <ImageR el={el} data={data} />;
    case "rectangle": return <RectR el={el} />;
    case "line": return <LineR el={el} pxPerMm={pxPerMm} />;
    case "barcode": return <BarcodeR el={el} data={data} />;
    case "table": return <TableR el={el} data={data} pxPerMm={pxPerMm} />;
    case "chart": return <ChartR el={el} data={data} />;
    case "crosstab": return <CrossTabR el={el} data={data} />;
    case "subreport": return <SubReportR el={el} data={data} pxPerMm={pxPerMm} />;
    case "pagebreak": return <PageBreakR el={el} />;
  }
}

const MAX_SUBREPORT_DEPTH = 8;

function SubReportR({ el, data, pxPerMm }: { el: SubReportElement; data: Record<string, unknown>; pxPerMm: number }) {
  const depth = Number(data.__subdepth) || 0;
  if (depth >= MAX_SUBREPORT_DEPTH) {
    return <div style={{ fontSize: 9, color: "#b91c1c" }}>⚠ sub-report nesting too deep</div>;
  }
  const sub = el.document;
  const resolved = el.dataSource ? resolveBinding(el.dataSource, data) : undefined;
  const base: Record<string, unknown> =
    resolved && typeof resolved === "object" && !Array.isArray(resolved)
      ? { ...data, ...(resolved as Record<string, unknown>) }
      : { ...data, sub: resolved };
  const subData = { ...base, __subdepth: depth + 1 };
  const bands = (sub?.bands ?? []).filter(
    (b) => b.type === "reportHeader" || b.type === "body" || b.type === "reportFooter",
  );
  let topMm = 0;
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", border: "1px dashed #cbd5e1", background: el.style?.backgroundColor }}>
      {bands.flatMap((band) => {
        const bandTop = topMm;
        topMm += band.height;
        return band.elements
          .filter((nel) => nel.visible !== false && evaluateCondition(nel.visibleIf, subData))
          .map((nel) => (
            <div
              key={nel.id}
              style={{
                position: "absolute",
                left: nel.bounds.x * pxPerMm,
                top: (bandTop + nel.bounds.y) * pxPerMm,
                width: nel.bounds.width * pxPerMm,
                height: nel.bounds.height * pxPerMm,
              }}
            >
              {renderElement(nel, subData, pxPerMm)}
            </div>
          ));
      })}
    </div>
  );
}

function CrossTabR({ el, data }: { el: CrossTabElement; data: Record<string, unknown> }) {
  const rows = evaluateArray(el.dataSource ?? "", data);
  const p = pivot(rows, el.rowField, el.columnField, el.valueField, el.aggregate ?? "sum");
  const fmt = (n: number) => applyFormat(n, el.format);
  const hSt = styleOf(el.headerStyle);
  const cSt = styleOf(el.cellStyle);
  return (
    <table className="rd-tbl rd-crosstab">
      <thead>
        <tr>
          <th style={hSt}>{el.rowField} \ {el.columnField}</th>
          {p.colKeys.map((c) => <th key={c} style={{ ...hSt, textAlign: "right" }}>{c}</th>)}
          {el.showRowTotals && <th style={{ ...hSt, textAlign: "right" }}>Σ</th>}
        </tr>
      </thead>
      <tbody>
        {p.rowKeys.map((r) => (
          <tr key={r}>
            <th style={{ ...hSt, textAlign: "left" }}>{r}</th>
            {p.colKeys.map((c) => <td key={c} style={{ ...cSt, textAlign: "right" }}>{fmt(p.cells[r][c])}</td>)}
            {el.showRowTotals && <td style={{ ...cSt, textAlign: "right", fontWeight: 600 }}>{fmt(p.rowTotals[r])}</td>}
          </tr>
        ))}
      </tbody>
      {el.showColumnTotals && (
        <tfoot>
          <tr style={{ fontWeight: 600 }}>
            <th style={{ ...hSt, textAlign: "left" }}>Σ</th>
            {p.colKeys.map((c) => <td key={c} style={{ ...cSt, textAlign: "right" }}>{fmt(p.colTotals[c])}</td>)}
            {el.showRowTotals && <td style={{ ...cSt, textAlign: "right" }}>{fmt(p.grand)}</td>}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function TextR({ el, data }: { el: TextElement; data: Record<string, unknown> }) {
  const style = mergeConditional(el.style, el.conditional, data);
  const text = applyFormat(evaluateValue(el.value, data), el.format);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        fontFamily: style.fontFamily,
        fontSize: style.fontSize ? `${style.fontSize}pt` : undefined,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        color: style.color,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        textDecoration: style.textDecoration,
        textAlign: style.horizontalAlign,
        display: "flex",
        alignItems:
          style.verticalAlign === "middle" ? "center" :
          style.verticalAlign === "bottom" ? "flex-end" : "flex-start",
        justifyContent:
          style.horizontalAlign === "center" ? "center" :
          style.horizontalAlign === "right" ? "flex-end" : "flex-start",
        background: style.backgroundColor,
        border: style.borderWidth ? `${style.borderWidth}px ${style.borderStyle ?? "solid"} ${style.borderColor ?? "#000"}` : undefined,
        borderRadius: style.borderRadius,
        padding: typeof style.padding === "number" ? style.padding : undefined,
        opacity: style.opacity,
        whiteSpace: el.wrap === false ? "nowrap" : "normal",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {text || <span style={{ opacity: 0.35 }}>Text</span>}
    </div>
  );
}

function ImageR({ el, data }: { el: ImageElement; data: Record<string, unknown> }) {
  const style = el.style ?? {};
  const src = evaluateValue(el.source ?? "", data);
  return (
    <div
      style={{
        width: "100%", height: "100%",
        background: style.backgroundColor,
        border: style.borderWidth ? `${style.borderWidth}px ${style.borderStyle ?? "solid"} ${style.borderColor ?? "#000"}` : undefined,
        borderRadius: style.borderRadius,
        overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: style.opacity,
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: el.fit ?? "contain" }}
          draggable={false}
        />
      ) : (
        <div style={{ fontSize: 10, color: "#9ca3af", textAlign: "center" }}>Image</div>
      )}
    </div>
  );
}

function RectR({ el }: { el: RectangleElement }) {
  const style = el.style ?? {};
  return (
    <div
      style={{
        width: "100%", height: "100%",
        background: style.backgroundColor ?? "transparent",
        border: `${style.borderWidth ?? 0.3}px ${style.borderStyle ?? "solid"} ${style.borderColor ?? "#111827"}`,
        borderRadius: style.borderRadius,
        opacity: style.opacity,
      }}
    />
  );
}

function LineR({ el, pxPerMm }: { el: LineElement; pxPerMm: number }) {
  const thickness = Math.max(0.5, (el.width ?? 0.3) * pxPerMm);
  const color = el.color ?? "#111827";
  const dash = el.style === "dashed" ? "4 4" : el.style === "dotted" ? "1 3" : undefined;
  return (
    <svg width="100%" height="100%" style={{ overflow: "visible" }}>
      {el.direction === "vertical" ? (
        <line x1={0} y1={0} x2={0} y2="100%" stroke={color} strokeWidth={thickness} strokeDasharray={dash} />
      ) : (
        <line x1={0} y1="50%" x2="100%" y2="50%" stroke={color} strokeWidth={thickness} strokeDasharray={dash} />
      )}
    </svg>
  );
}

function BarcodeR({ el, data }: { el: BarcodeElement; data: Record<string, unknown> }) {
  // Lightweight placeholder visual (real barcode rendered server-side).
  const text = evaluateValue(el.value ?? "", data);
  const bars = Math.max(16, Math.floor(text.length * 4));
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ flex: 1, display: "flex", gap: 1 }}>
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            style={{ flex: "1 1 0", background: i % (1 + (i % 3)) === 0 ? "#111" : "transparent" }}
          />
        ))}
      </div>
      {el.showText && <div style={{ fontSize: 8, textAlign: "center", fontFamily: "monospace" }}>{text}</div>}
    </div>
  );
}

function PageBreakR(_: { el: PageBreakElement }) {
  return (
    <div style={{ width: "100%", height: "100%", borderTop: "2px dashed #9ca3af", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: 9, color: "#6b7280", background: "#fff", padding: "0 6px" }}>PAGE BREAK</span>
    </div>
  );
}

function TableR({ el, data, pxPerMm }: { el: TableElement; data: Record<string, unknown>; pxPerMm: number }) {
  const bound = evaluateArray(el.dataSource ?? "", data);
  const rows = shapeRows(bound, el, data); // filter + sort (Crystal record selection/sort)
  const headerH = (el.headerHeight ?? 8) * pxPerMm;
  const rowH = (el.rowHeight ?? 7) * pxPerMm;
  const colTotal = el.columns.reduce((s, c) => s + c.width, 0) || 1;
  const running: Record<string, number> = {};

  const rowTr = (row: unknown, i: number, hasData: boolean) => (
    <tr key={`r${i}`} style={{ height: rowH }}>
      {el.columns.map((c) => {
        const ctx = { ...data, row, RowNumber: i + 1 };
        const cellStyle = mergeConditional(c.cellStyle, c.conditional, ctx);
        let content: React.ReactNode;
        if (c.runningTotal && hasData) {
          running[c.id] = (running[c.id] ?? 0) + (Number(evaluateValue(c.cell, ctx)) || 0);
          content = applyFormat(running[c.id], c.format);
        } else {
          content = applyFormat(evaluateValue(c.cell, ctx), c.format) || (hasData ? "" : <span style={{ opacity: 0.25 }}>…</span>);
        }
        return (
          <td key={c.id} style={{ width: `${(c.width / colTotal) * 100}%`, ...styleOf(cellStyle), background: cellStyle.backgroundColor ?? (i % 2 ? el.alternateRowColor : undefined) }}>
            {content}
          </td>
        );
      })}
    </tr>
  );

  const renderBodyRows = (): React.ReactNode[] => {
    if (!rows.length) return [{}, {}, {}].map((row, i) => rowTr(row, i, false));
    const groups = groupRows(rows, el.groupBy);
    const trs: React.ReactNode[] = [];
    let i = 0;
    groups.forEach((g, gi) => {
      if (el.groupBy && el.groupHeader != null) {
        trs.push(
          <tr key={`gh${gi}`} style={{ height: rowH, fontWeight: 600 }}>
            <td colSpan={el.columns.length} style={{ background: "#eef2ff", padding: "0 4px" }}>
              {evaluateValue(el.groupHeader, { ...data, group: g.key, GroupCount: g.rows.length })}
            </td>
          </tr>,
        );
      }
      g.rows.forEach((row) => { trs.push(rowTr(row, i, true)); i++; });
      if (el.groupBy && el.showGroupFooter) {
        trs.push(
          <tr key={`gf${gi}`} style={{ height: rowH, fontWeight: 600 }}>
            {el.columns.map((c) => (
              <td key={c.id} style={{ width: `${(c.width / colTotal) * 100}%`, background: "#f1f5f9", ...styleOf(c.cellStyle) }}>
                {c.summary
                  ? applyFormat(aggregate(c.summary, g.rows.map((r) => Number(evaluateValue(c.cell, { ...data, row: r })))), c.format)
                  : ""}
              </td>
            ))}
          </tr>,
        );
      }
    });
    return trs;
  };

  return (
    <table className="rd-tbl">
      {el.showHeader !== false && (
        <thead>
          <tr style={{ height: headerH }}>
            {el.columns.map((c) => (
              <th key={c.id} style={{ width: `${(c.width / colTotal) * 100}%`, ...styleOf(c.headerStyle) }}>
                {evaluateValue(c.header, data)}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {renderBodyRows()}
      </tbody>
      {el.showFooter && (
        <tfoot>
          <tr style={{ height: (el.footerHeight ?? el.rowHeight ?? 7) * pxPerMm, fontWeight: 600, borderTop: "1.5px solid #444" }}>
            {el.columns.map((c) => (
              <td key={c.id} style={{ width: `${(c.width / colTotal) * 100}%`, ...styleOf(c.cellStyle) }}>
                {footerCell(c, rows, data)}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/** Footer cell: a column summary aggregate, or a literal/expression footer. */
function footerCell(c: TableColumn, rows: unknown[], data: Record<string, unknown>): string {
  if (c.summary) {
    const values = rows.map((row) => Number(evaluateValue(c.cell, { ...data, row })));
    return applyFormat(aggregate(c.summary, values), c.format);
  }
  if (c.footer) return applyFormat(evaluateValue(c.footer, data), c.format);
  return "";
}

function styleOf(s: any): React.CSSProperties {
  if (!s) return {};
  return {
    fontFamily: s.fontFamily,
    fontSize: s.fontSize ? `${s.fontSize}pt` : undefined,
    fontWeight: s.fontWeight,
    fontStyle: s.fontStyle,
    color: s.color,
    textAlign: s.horizontalAlign,
    background: s.backgroundColor,
  };
}

function ChartR({ el, data }: { el: ChartElement; data: Record<string, unknown> }) {
  const rows = evaluateArray(el.dataSource ?? "", data);
  const values = rows.length
    ? rows.map((r: any) => Number(r?.[el.valueField] ?? 0))
    : [40, 60, 30, 80, 55, 45];
  const labels = rows.length
    ? rows.map((r: any) => String(r?.[el.categoryField] ?? ""))
    : ["A", "B", "C", "D", "E", "F"];
  const max = Math.max(...values, 1);
  const palette = el.palette ?? ["#4f46e5", "#0ea5e9", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6"];

  if (el.kind === "pie" || el.kind === "doughnut") {
    const total = values.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    const inner = el.kind === "doughnut" ? 22 : 0;
    return (
      <svg viewBox="-50 -50 100 100" width="100%" height="100%">
        {values.map((v, i) => {
          const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
          acc += v;
          const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const x0 = Math.cos(a0) * 45, y0 = Math.sin(a0) * 45;
          const x1 = Math.cos(a1) * 45, y1 = Math.sin(a1) * 45;
          return (
            <path key={i} d={`M 0 0 L ${x0} ${y0} A 45 45 0 ${large} 1 ${x1} ${y1} Z`} fill={palette[i % palette.length]} />
          );
        })}
        {inner > 0 && <circle r={inner} fill="#fff" />}
      </svg>
    );
  }

  const w = 100, h = 60;
  const bw = w / values.length;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      {el.title && <div style={{ fontSize: 10, fontWeight: 600, textAlign: "center", marginBottom: 2 }}>{el.title}</div>}
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height="100%">
        {el.kind === "line" || el.kind === "area" ? (
          <>
            {el.kind === "area" && (
              <path
                d={`M 0 ${h} ${values.map((v, i) => `L ${i * bw + bw / 2} ${h - (v / max) * (h - 8)}`).join(" ")} L ${w} ${h} Z`}
                fill={palette[0] + "33"}
              />
            )}
            <path
              d={values.map((v, i) => `${i === 0 ? "M" : "L"} ${i * bw + bw / 2} ${h - (v / max) * (h - 8)}`).join(" ")}
              fill="none" stroke={palette[0]} strokeWidth={1.4}
            />
          </>
        ) : (
          values.map((v, i) => {
            const barH = (v / max) * (h - 8);
            return (
              <rect key={i}
                x={i * bw + bw * 0.15}
                y={h - barH}
                width={bw * 0.7}
                height={barH}
                fill={palette[i % palette.length]}
                rx={0.6}
              />
            );
          })
        )}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-around", fontSize: 7, color: "#6b7280" }}>
        {labels.slice(0, values.length).map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  );
}
