import type {
  BarcodeElement,
  ChartElement,
  ChartKind,
  ImageElement,
  LineElement,
  RectangleElement,
  ReportElement,
  TableColumn,
  TableElement,
  TextElement,
} from "@reporting/schema";
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
    </>
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

function BoxStyleGroup({ style, set }: { style: any; set: (k: string, v: any) => void }) {
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
