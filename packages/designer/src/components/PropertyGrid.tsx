import type {
  BarcodeElement,
  ChartElement,
  ChartKind,
  ConditionalFormat,
  CrossTabElement,
  SubReportElement,
  ImageElement,
  LineElement,
  Parameter,
  RectangleElement,
  ReportElement,
  TableColumn,
  TableElement,
  TextElement,
} from "@xdarkoy/schema";
import { nanoid } from "nanoid";
import { useDesignerStore } from "../store/designerStore";

export function PropertyGrid() {
  const doc = useDesignerStore((s) => s.doc);
  const selection = useDesignerStore((s) => s.selection);
  const updateElement = useDesignerStore((s) => s.updateElement);
  const updateBand = useDesignerStore((s) => s.updateBand);
  const setDocument = useDesignerStore((s) => s.setDocument);

  if (selection.kind === "none") {
    return (
      <div className="rd-panel-body rd-scroll">
        <ReportProps />
      </div>
    );
  }

  if (selection.kind === "band") {
    const band = doc.bands.find((b) => b.type === selection.bandType);
    if (!band) return null;
    return (
      <div className="rd-panel-body rd-scroll">
        <Group title={`Band: ${band.type}`}>
          <Field label="Height (mm)">
            <input
              type="number"
              value={band.height}
              step={1}
              min={0}
              onChange={(e) =>
                updateBand(band.type, (b) => ({ ...b, height: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </Field>
        </Group>
      </div>
    );
  }

  const band = doc.bands.find((b) => b.type === selection.bandType);
  const el = band?.elements.find((e) => e.id === selection.elementId);
  if (!el) return null;

  const patch = (updater: (el: ReportElement) => ReportElement) =>
    updateElement(selection.bandType, el.id, updater);

  return (
    <div className="rd-panel-body rd-scroll">
      <Group title="Element">
        <Field label="Name">
          <input
            value={el.name ?? ""}
            onChange={(e) => patch((p) => ({ ...p, name: e.target.value || undefined }))}
          />
        </Field>
        <Field label="Type">
          <input value={el.type} disabled />
        </Field>
        <Field label="Locked">
          <input
            type="checkbox"
            checked={!!el.locked}
            onChange={(e) => patch((p) => ({ ...p, locked: e.target.checked }))}
          />
        </Field>
        <Field label="Visible">
          <input
            type="checkbox"
            checked={el.visible !== false}
            onChange={(e) => patch((p) => ({ ...p, visible: e.target.checked }))}
          />
        </Field>
        <Field label="Visible If">
          <input
            value={el.visibleIf ?? ""}
            placeholder="e.g. = row.total > 0"
            onChange={(e) => patch((p) => ({ ...p, visibleIf: e.target.value || undefined }))}
          />
        </Field>
      </Group>

      <Group title="Layout">
        <NumField label="X (mm)" value={el.bounds.x} onChange={(v) => patch((p) => ({ ...p, bounds: { ...p.bounds, x: v } }))} />
        <NumField label="Y (mm)" value={el.bounds.y} onChange={(v) => patch((p) => ({ ...p, bounds: { ...p.bounds, y: v } }))} />
        <NumField label="Width" value={el.bounds.width} onChange={(v) => patch((p) => ({ ...p, bounds: { ...p.bounds, width: v } }))} />
        <NumField label="Height" value={el.bounds.height} onChange={(v) => patch((p) => ({ ...p, bounds: { ...p.bounds, height: v } }))} />
      </Group>

      {el.type === "text" && <TextProps el={el} patch={patch} />}
      {el.type === "image" && <ImageProps el={el} patch={patch} />}
      {el.type === "rectangle" && <RectProps el={el} patch={patch} />}
      {el.type === "line" && <LineProps el={el} patch={patch} />}
      {el.type === "barcode" && <BarcodeProps el={el} patch={patch} />}
      {el.type === "table" && <TableProps el={el} patch={patch} />}
      {el.type === "chart" && <ChartProps el={el} patch={patch} />}
      {el.type === "crosstab" && <CrossTabProps el={el} patch={patch} />}
      {el.type === "subreport" && <SubReportProps el={el} patch={patch} />}
    </div>
  );
}

function ReportProps() {
  const doc = useDesignerStore((s) => s.doc);
  const setDocument = useDesignerStore((s) => s.setDocument);
  return (
    <>
      <Group title="Report">
        <Field label="Title">
          <input
            value={doc.meta.title}
            onChange={(e) => setDocument({ ...doc, meta: { ...doc.meta, title: e.target.value } })}
          />
        </Field>
        <Field label="Author">
          <input
            value={doc.meta.author ?? ""}
            onChange={(e) => setDocument({ ...doc, meta: { ...doc.meta, author: e.target.value || undefined } })}
          />
        </Field>
      </Group>
      <Group title="Page">
        <Field label="Size">
          <select
            value={typeof doc.page.size === "string" ? doc.page.size : "custom"}
            onChange={(e) => setDocument({ ...doc, page: { ...doc.page, size: e.target.value as any } })}
          >
            {["A3", "A4", "A5", "Letter", "Legal"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Orientation">
          <select
            value={doc.page.orientation}
            onChange={(e) => setDocument({ ...doc, page: { ...doc.page, orientation: e.target.value as any } })}
          >
            <option value="portrait">portrait</option>
            <option value="landscape">landscape</option>
          </select>
        </Field>
        <NumField label="Margin T" value={doc.page.margin.top} onChange={(v) => setDocument({ ...doc, page: { ...doc.page, margin: { ...doc.page.margin, top: v } } })} />
        <NumField label="Margin R" value={doc.page.margin.right} onChange={(v) => setDocument({ ...doc, page: { ...doc.page, margin: { ...doc.page.margin, right: v } } })} />
        <NumField label="Margin B" value={doc.page.margin.bottom} onChange={(v) => setDocument({ ...doc, page: { ...doc.page, margin: { ...doc.page.margin, bottom: v } } })} />
        <NumField label="Margin L" value={doc.page.margin.left} onChange={(v) => setDocument({ ...doc, page: { ...doc.page, margin: { ...doc.page.margin, left: v } } })} />
      </Group>
      <ReportGroupingGroup />
      <ParametersGroup />
    </>
  );
}

const BAND_ORDER = ["pageHeader", "reportHeader", "groupHeader", "body", "groupFooter", "reportFooter", "pageFooter"];

function ReportGroupingGroup() {
  const doc = useDesignerStore((s) => s.doc);
  const setDocument = useDesignerStore((s) => s.setDocument);
  const grouping = doc.grouping;
  const hasBand = (t: string) => doc.bands.some((b) => b.type === t);
  const toggleBand = (t: any) => {
    const bands = hasBand(t)
      ? doc.bands.filter((b) => b.type !== t)
      : [...doc.bands, { type: t, height: 15, elements: [] }].sort(
          (a, b) => BAND_ORDER.indexOf(a.type) - BAND_ORDER.indexOf(b.type),
        );
    setDocument({ ...doc, bands });
  };
  const setG = (patch: any) =>
    setDocument({ ...doc, grouping: { dataSource: grouping?.dataSource ?? "", field: grouping?.field ?? "", ...patch } });
  return (
    <Group title="Report grouping">
      <Field label="Enabled">
        <input
          type="checkbox"
          checked={!!grouping}
          onChange={(e) => setDocument({ ...doc, grouping: e.target.checked ? { dataSource: "", field: "" } : undefined })}
        />
      </Field>
      {grouping && (
        <>
          <Field label="Master data">
            <input value={grouping.dataSource} placeholder="{{sales}}" onChange={(e) => setG({ dataSource: e.target.value })} />
          </Field>
          <Field label="Group field">
            <input value={grouping.field} placeholder="region" onChange={(e) => setG({ field: e.target.value })} />
          </Field>
          <Field label="Group header band">
            <input type="checkbox" checked={hasBand("groupHeader")} onChange={() => toggleBand("groupHeader")} />
          </Field>
          <Field label="Group footer band">
            <input type="checkbox" checked={hasBand("groupFooter")} onChange={() => toggleBand("groupFooter")} />
          </Field>
          <div style={{ fontSize: 10, color: "var(--rd-muted)" }}>
            In group bands use <code>{"{{group}}"}</code>, <code>{"{{groupItems}}"}</code> (bind a table to it) and <code>{"{{GroupCount}}"}</code>.
          </div>
        </>
      )}
    </Group>
  );
}

function ParametersGroup() {
  const doc = useDesignerStore((s) => s.doc);
  const setDocument = useDesignerStore((s) => s.setDocument);
  const params = doc.parameters ?? [];
  const setParam = (i: number, u: (p: Parameter) => Parameter) =>
    setDocument({ ...doc, parameters: params.map((p, idx) => (idx === i ? u(p) : p)) });
  const addParam = () =>
    setDocument({
      ...doc,
      parameters: [...params, { id: nanoid(8), name: `param${params.length + 1}`, type: "string" }],
    });
  const delParam = (i: number) =>
    setDocument({ ...doc, parameters: params.filter((_, idx) => idx !== i) });

  return (
    <Group title="Parameters">
      <div style={{ fontSize: 10, color: "var(--rd-muted)", marginBottom: 4 }}>
        Use as <code>{"{{params.name}}"}</code> in any binding.
      </div>
      {params.map((p, i) => (
        <div key={p.id} style={{ border: "1px solid var(--rd-border)", borderRadius: 6, padding: 8, marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <strong style={{ fontSize: 11 }}>#{i + 1}</strong>
            <span style={{ flex: 1 }} />
            <button className="rd-btn rd-icon" title="Remove" onClick={() => delParam(i)}>×</button>
          </div>
          <Field label="Name">
            <input value={p.name} onChange={(e) => setParam(i, (x) => ({ ...x, name: e.target.value }))} />
          </Field>
          <Field label="Type">
            <select value={p.type} onChange={(e) => setParam(i, (x) => ({ ...x, type: e.target.value as Parameter["type"], defaultValue: undefined }))}>
              {(["string", "number", "boolean", "date"] as const).map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Prompt">
            <input value={p.prompt ?? ""} placeholder="Frage an den Nutzer" onChange={(e) => setParam(i, (x) => ({ ...x, prompt: e.target.value || undefined }))} />
          </Field>
          <Field label="Value">
            {p.type === "boolean" ? (
              <input type="checkbox" checked={p.defaultValue === true} onChange={(e) => setParam(i, (x) => ({ ...x, defaultValue: e.target.checked }))} />
            ) : (
              <input
                type={p.type === "number" ? "number" : p.type === "date" ? "date" : "text"}
                value={(p.defaultValue as string | number) ?? ""}
                onChange={(e) => setParam(i, (x) => ({ ...x, defaultValue: e.target.value }))}
              />
            )}
          </Field>
        </div>
      ))}
      <button className="rd-btn" onClick={addParam}>+ Add parameter</button>
    </Group>
  );
}

function TextProps({ el, patch }: { el: TextElement; patch: (u: (el: ReportElement) => ReportElement) => void }) {
  const s = el.style ?? {};
  const set = (k: keyof typeof s, v: any) =>
    patch((p) => ({ ...p, style: { ...(p as TextElement).style, [k]: v } } as ReportElement));
  return (
    <>
      <Group title="Value">
        <TextArea value={el.value} onChange={(v) => patch((p) => ({ ...(p as TextElement), value: v }))}
          placeholder="Plain text, {{binding}} or = expression" />
        <Field label="Format">
          <input
            value={el.format ?? ""}
            placeholder="{0:C}, {0:N2}, yyyy-MM-dd"
            onChange={(e) => patch((p) => ({ ...(p as TextElement), format: e.target.value || undefined }))}
          />
        </Field>
      </Group>
      <Group title="Typography">
        <Field label="Font">
          <input value={s.fontFamily ?? ""} onChange={(e) => set("fontFamily", e.target.value || undefined)} placeholder="Inter, Arial, …" />
        </Field>
        <NumField label="Size (pt)" value={s.fontSize ?? 10} onChange={(v) => set("fontSize", v)} />
        <Field label="Weight">
          <select value={String(s.fontWeight ?? "normal")} onChange={(e) => set("fontWeight", e.target.value === "normal" ? "normal" : Number(e.target.value) as any)}>
            {["normal", "300", "400", "500", "600", "700", "800"].map((w) => <option key={w}>{w}</option>)}
          </select>
        </Field>
        <Field label="Italic">
          <input type="checkbox" checked={s.fontStyle === "italic"} onChange={(e) => set("fontStyle", e.target.checked ? "italic" : "normal")} />
        </Field>
        <Field label="Color">
          <input type="color" value={s.color ?? "#111827"} onChange={(e) => set("color", e.target.value)} />
        </Field>
        <Field label="Align">
          <select value={s.horizontalAlign ?? "left"} onChange={(e) => set("horizontalAlign", e.target.value as any)}>
            {["left", "center", "right", "justify"].map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="V-Align">
          <select value={s.verticalAlign ?? "top"} onChange={(e) => set("verticalAlign", e.target.value as any)}>
            {["top", "middle", "bottom"].map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
      </Group>
      <BoxStyleGroup style={s} set={set} />
      <ConditionalEditor
        rules={el.conditional}
        onChange={(r) => patch((p) => ({ ...(p as TextElement), conditional: r.length ? r : undefined }))}
      />
    </>
  );
}

function ImageProps({ el, patch }: { el: ImageElement; patch: (u: (el: ReportElement) => ReportElement) => void }) {
  return (
    <>
      <Group title="Source">
        <TextArea value={el.source} onChange={(v) => patch((p) => ({ ...(p as ImageElement), source: v }))}
          placeholder="URL, data:... or {{Company.Logo}}" />
        <Field label="Fit">
          <select value={el.fit ?? "contain"} onChange={(e) => patch((p) => ({ ...(p as ImageElement), fit: e.target.value as any }))}>
            {["contain", "cover", "fill", "none"].map((f) => <option key={f}>{f}</option>)}
          </select>
        </Field>
      </Group>
    </>
  );
}

function RectProps({ el, patch }: { el: RectangleElement; patch: (u: (el: ReportElement) => ReportElement) => void }) {
  const s = el.style ?? {};
  const set = (k: keyof typeof s, v: any) =>
    patch((p) => ({ ...p, style: { ...(p as RectangleElement).style, [k]: v } } as ReportElement));
  return <BoxStyleGroup style={s} set={set} />;
}

function LineProps({ el, patch }: { el: LineElement; patch: (u: (el: ReportElement) => ReportElement) => void }) {
  return (
    <Group title="Line">
      <Field label="Direction">
        <select value={el.direction ?? "horizontal"} onChange={(e) => patch((p) => ({ ...(p as LineElement), direction: e.target.value as any }))}>
          {["horizontal", "vertical", "diagonal"].map((d) => <option key={d}>{d}</option>)}
        </select>
      </Field>
      <Field label="Style">
        <select value={el.style ?? "solid"} onChange={(e) => patch((p) => ({ ...(p as LineElement), style: e.target.value as any }))}>
          {["solid", "dashed", "dotted"].map((d) => <option key={d}>{d}</option>)}
        </select>
      </Field>
      <NumField label="Width" value={el.width ?? 0.3} onChange={(v) => patch((p) => ({ ...(p as LineElement), width: v }))} step={0.1} />
      <Field label="Color">
        <input type="color" value={el.color ?? "#111827"} onChange={(e) => patch((p) => ({ ...(p as LineElement), color: e.target.value }))} />
      </Field>
    </Group>
  );
}

function BarcodeProps({ el, patch }: { el: BarcodeElement; patch: (u: (el: ReportElement) => ReportElement) => void }) {
  return (
    <Group title="Barcode">
      <TextArea value={el.value} onChange={(v) => patch((p) => ({ ...(p as BarcodeElement), value: v }))} placeholder="Value or {{binding}}" />
      <Field label="Symbology">
        <select value={el.symbology} onChange={(e) => patch((p) => ({ ...(p as BarcodeElement), symbology: e.target.value as any }))}>
          {["code128", "code39", "ean13", "ean8", "qrcode", "datamatrix", "pdf417"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Show text">
        <input type="checkbox" checked={el.showText !== false} onChange={(e) => patch((p) => ({ ...(p as BarcodeElement), showText: e.target.checked }))} />
      </Field>
    </Group>
  );
}

function TableProps({ el, patch }: { el: TableElement; patch: (u: (el: ReportElement) => ReportElement) => void }) {
  const setCol = (i: number, updater: (c: TableColumn) => TableColumn) =>
    patch((p) => {
      const t = p as TableElement;
      return { ...t, columns: t.columns.map((c, idx) => (idx === i ? updater(c) : c)) };
    });
  const addCol = () =>
    patch((p) => {
      const t = p as TableElement;
      return {
        ...t,
        columns: [...t.columns, { id: nanoid(6), header: "Column", cell: "", width: 30 }],
      };
    });
  const delCol = (i: number) =>
    patch((p) => {
      const t = p as TableElement;
      return { ...t, columns: t.columns.filter((_, idx) => idx !== i) };
    });

  return (
    <>
      <Group title="Data">
        <Field label="Source">
          <input
            value={el.dataSource}
            onChange={(e) => patch((p) => ({ ...(p as TableElement), dataSource: e.target.value }))}
            placeholder="{{Order.Items}}"
          />
        </Field>
        <NumField label="Row H (mm)" value={el.rowHeight ?? 7} onChange={(v) => patch((p) => ({ ...(p as TableElement), rowHeight: v }))} />
        <NumField label="Hdr H (mm)" value={el.headerHeight ?? 8} onChange={(v) => patch((p) => ({ ...(p as TableElement), headerHeight: v }))} />
        <Field label="Alt row">
          <input type="color" value={el.alternateRowColor ?? "#f9fafb"} onChange={(e) => patch((p) => ({ ...(p as TableElement), alternateRowColor: e.target.value }))} />
        </Field>
        <Field label="Filter">
          <input
            value={el.filter ?? ""}
            placeholder="= row.qty > 0"
            onChange={(e) => patch((p) => ({ ...(p as TableElement), filter: e.target.value || undefined }))}
          />
        </Field>
        <Field label="Sort field">
          <input
            value={el.sort?.[0]?.field ?? ""}
            placeholder="z.B. price"
            onChange={(e) => patch((p) => {
              const t = p as TableElement;
              const field = e.target.value;
              return { ...t, sort: field ? [{ field, dir: t.sort?.[0]?.dir ?? "asc" }] : undefined };
            })}
          />
        </Field>
        {el.sort?.[0]?.field && (
          <Field label="Sort dir">
            <select
              value={el.sort[0].dir ?? "asc"}
              onChange={(e) => patch((p) => {
                const t = p as TableElement;
                return { ...t, sort: [{ field: t.sort![0].field, dir: e.target.value as "asc" | "desc" }] };
              })}
            >
              <option value="asc">asc</option>
              <option value="desc">desc</option>
            </select>
          </Field>
        )}
      </Group>
      <Group title="Summary row">
        <Field label="Show footer">
          <input
            type="checkbox"
            checked={!!el.showFooter}
            onChange={(e) => patch((p) => ({ ...(p as TableElement), showFooter: e.target.checked }))}
          />
        </Field>
        {el.showFooter && (
          <NumField label="Footer H (mm)" value={el.footerHeight ?? el.rowHeight ?? 7} onChange={(v) => patch((p) => ({ ...(p as TableElement), footerHeight: v }))} />
        )}
      </Group>
      <Group title="Grouping">
        <Field label="Group by">
          <input
            value={el.groupBy ?? ""}
            placeholder="z.B. category"
            onChange={(e) => patch((p) => ({ ...(p as TableElement), groupBy: e.target.value || undefined }))}
          />
        </Field>
        {el.groupBy && (
          <>
            <Field label="Header">
              <input
                value={el.groupHeader ?? ""}
                placeholder="Kategorie: {{group}}"
                onChange={(e) => patch((p) => ({ ...(p as TableElement), groupHeader: e.target.value || undefined }))}
              />
            </Field>
            <Field label="Subtotals">
              <input
                type="checkbox"
                checked={!!el.showGroupFooter}
                onChange={(e) => patch((p) => ({ ...(p as TableElement), showGroupFooter: e.target.checked }))}
              />
            </Field>
          </>
        )}
      </Group>
      <Group title="Columns">
        {el.columns.map((c, i) => (
          <div key={c.id} style={{ border: "1px solid var(--rd-border)", borderRadius: 6, padding: 8, marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
              <strong style={{ fontSize: 11 }}>#{i + 1}</strong>
              <span style={{ flex: 1 }} />
              <button className="rd-btn rd-icon" title="Remove" onClick={() => delCol(i)}>×</button>
            </div>
            <Field label="Header">
              <input value={String(c.header)} onChange={(e) => setCol(i, (x) => ({ ...x, header: e.target.value }))} />
            </Field>
            <Field label="Cell">
              <input value={String(c.cell)} onChange={(e) => setCol(i, (x) => ({ ...x, cell: e.target.value }))} />
            </Field>
            <NumField label="Width" value={c.width} onChange={(v) => setCol(i, (x) => ({ ...x, width: v }))} />
            <Field label="Format">
              <input value={c.format ?? ""} onChange={(e) => setCol(i, (x) => ({ ...x, format: e.target.value || undefined }))} />
            </Field>
            <Field label="Running total">
              <input
                type="checkbox"
                checked={!!c.runningTotal}
                onChange={(e) => setCol(i, (x) => ({ ...x, runningTotal: e.target.checked || undefined }))}
              />
            </Field>
            <ConditionalEditor
              rules={c.conditional}
              onChange={(r) => setCol(i, (x) => ({ ...x, conditional: r.length ? r : undefined }))}
            />
            {el.showFooter && (
              <>
                <Field label="Summary">
                  <select
                    value={c.summary ?? ""}
                    onChange={(e) => setCol(i, (x) => ({ ...x, summary: (e.target.value || undefined) as TableColumn["summary"] }))}
                  >
                    <option value="">— none —</option>
                    {(["sum", "avg", "count", "min", "max"] as const).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                {!c.summary && (
                  <Field label="Footer text">
                    <input
                      value={c.footer ?? ""}
                      placeholder="e.g. Gesamt:"
                      onChange={(e) => setCol(i, (x) => ({ ...x, footer: e.target.value || undefined }))}
                    />
                  </Field>
                )}
              </>
            )}
          </div>
        ))}
        <button className="rd-btn" onClick={addCol}>+ Add column</button>
      </Group>
    </>
  );
}

function ChartProps({ el, patch }: { el: ChartElement; patch: (u: (el: ReportElement) => ReportElement) => void }) {
  const kinds: ChartKind[] = ["bar", "column", "line", "area", "pie", "doughnut", "scatter"];
  return (
    <Group title="Chart">
      <Field label="Kind">
        <select value={el.kind} onChange={(e) => patch((p) => ({ ...(p as ChartElement), kind: e.target.value as ChartKind }))}>
          {kinds.map((k) => <option key={k}>{k}</option>)}
        </select>
      </Field>
      <Field label="Source">
        <input value={el.dataSource} onChange={(e) => patch((p) => ({ ...(p as ChartElement), dataSource: e.target.value }))} />
      </Field>
      <Field label="Category">
        <input value={el.categoryField} onChange={(e) => patch((p) => ({ ...(p as ChartElement), categoryField: e.target.value }))} />
      </Field>
      <Field label="Value">
        <input value={el.valueField} onChange={(e) => patch((p) => ({ ...(p as ChartElement), valueField: e.target.value }))} />
      </Field>
      <Field label="Title">
        <input value={el.title ?? ""} onChange={(e) => patch((p) => ({ ...(p as ChartElement), title: e.target.value || undefined }))} />
      </Field>
    </Group>
  );
}

function CrossTabProps({ el, patch }: { el: CrossTabElement; patch: (u: (el: ReportElement) => ReportElement) => void }) {
  const set = (k: keyof CrossTabElement, v: any) => patch((p) => ({ ...(p as CrossTabElement), [k]: v }));
  return (
    <Group title="Cross-Tab">
      <Field label="Source">
        <input value={el.dataSource} placeholder="{{sales}}" onChange={(e) => set("dataSource", e.target.value)} />
      </Field>
      <Field label="Row field">
        <input value={el.rowField} placeholder="category" onChange={(e) => set("rowField", e.target.value)} />
      </Field>
      <Field label="Column field">
        <input value={el.columnField} placeholder="month" onChange={(e) => set("columnField", e.target.value)} />
      </Field>
      <Field label="Value field">
        <input value={el.valueField} placeholder="amount" onChange={(e) => set("valueField", e.target.value)} />
      </Field>
      <Field label="Aggregate">
        <select value={el.aggregate ?? "sum"} onChange={(e) => set("aggregate", e.target.value)}>
          {(["sum", "avg", "count", "min", "max"] as const).map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Format">
        <input value={el.format ?? ""} placeholder="{0:N2}" onChange={(e) => set("format", e.target.value || undefined)} />
      </Field>
      <Field label="Row totals">
        <input type="checkbox" checked={el.showRowTotals !== false} onChange={(e) => set("showRowTotals", e.target.checked)} />
      </Field>
      <Field label="Col totals">
        <input type="checkbox" checked={el.showColumnTotals !== false} onChange={(e) => set("showColumnTotals", e.target.checked)} />
      </Field>
    </Group>
  );
}

function SubReportProps({ el, patch }: { el: SubReportElement; patch: (u: (el: ReportElement) => ReportElement) => void }) {
  return (
    <Group title="Sub-Report">
      <Field label="Data slice">
        <input
          value={el.dataSource ?? ""}
          placeholder="{{order.customer}}"
          onChange={(e) => patch((p) => ({ ...(p as SubReportElement), dataSource: e.target.value || undefined }))}
        />
      </Field>
      <div style={{ fontSize: 10, color: "var(--rd-muted)", marginTop: 4 }}>
        Bound object's fields are available to the nested report. Edit the nested
        layout via the AI Copilot or the JSON file (<code>document</code>).
      </div>
    </Group>
  );
}

function BoxStyleGroup({ style, set }: { style: any; set: (k: any, v: any) => void }) {
  return (
    <Group title="Box">
      <Field label="Background">
        <input type="color" value={style.backgroundColor ?? "#ffffff"} onChange={(e) => set("backgroundColor", e.target.value)} />
      </Field>
      <Field label="Border clr">
        <input type="color" value={style.borderColor ?? "#111827"} onChange={(e) => set("borderColor", e.target.value)} />
      </Field>
      <NumField label="Border w" value={style.borderWidth ?? 0} step={0.1} onChange={(v) => set("borderWidth", v)} />
      <Field label="Border style">
        <select value={style.borderStyle ?? "solid"} onChange={(e) => set("borderStyle", e.target.value)}>
          {["solid", "dashed", "dotted", "none"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <NumField label="Radius" value={style.borderRadius ?? 0} onChange={(v) => set("borderRadius", v)} />
      <NumField label="Opacity" value={style.opacity ?? 1} step={0.05} onChange={(v) => set("opacity", v)} />
    </Group>
  );
}

// ---- conditional formatting (Crystal "Highlighting Expert") --------------

function ConditionalEditor({
  rules, onChange,
}: { rules?: ConditionalFormat[]; onChange: (r: ConditionalFormat[]) => void }) {
  const list = rules ?? [];
  const update = (i: number, u: (r: ConditionalFormat) => ConditionalFormat) =>
    onChange(list.map((r, idx) => (idx === i ? u(r) : r)));
  const setStyle = (i: number, k: string, v: any) =>
    update(i, (r) => ({ ...r, style: { ...r.style, [k]: v } }));
  return (
    <Group title="Conditional format">
      {list.map((r, i) => (
        <div key={i} style={{ border: "1px solid var(--rd-border)", borderRadius: 6, padding: 8, marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <strong style={{ fontSize: 11 }}>Rule #{i + 1}</strong>
            <span style={{ flex: 1 }} />
            <button className="rd-btn rd-icon" title="Remove" onClick={() => onChange(list.filter((_, idx) => idx !== i))}>×</button>
          </div>
          <Field label="When">
            <input value={r.when} placeholder="= row.total < 0" onChange={(e) => update(i, (x) => ({ ...x, when: e.target.value }))} />
          </Field>
          <Field label="Color">
            <input type="color" value={r.style.color ?? "#111827"} onChange={(e) => setStyle(i, "color", e.target.value)} />
          </Field>
          <Field label="Background">
            <input type="color" value={r.style.backgroundColor ?? "#ffffff"} onChange={(e) => setStyle(i, "backgroundColor", e.target.value)} />
          </Field>
          <Field label="Bold">
            <input
              type="checkbox"
              checked={r.style.fontWeight === "bold" || r.style.fontWeight === 700}
              onChange={(e) => setStyle(i, "fontWeight", e.target.checked ? "bold" : undefined)}
            />
          </Field>
        </div>
      ))}
      <button className="rd-btn" onClick={() => onChange([...list, { when: "", style: {} }])}>+ Add rule</button>
    </Group>
  );
}

// ---- atoms ---------------------------------------------------------------

function Group({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <div className="rd-props-group">
      <div className="rd-props-group-title">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: React.PropsWithChildren<{ label: string }>) {
  return <div className="rd-field"><label>{label}</label>{children}</div>;
}

function NumField({
  label, value, onChange, step = 1,
}: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <Field label={label}>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </Field>
  );
}

function TextArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="rd-field">
      <div className="rd-field-row2">
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </div>
    </div>
  );
}
