import { useState } from "react";
import { nanoid } from "nanoid";
import type { DataField, DataSource } from "@xdarkoy/schema";
import { useDesignerStore } from "../store/designerStore";
import { inferSchema } from "../utils/schema";

export function DataExplorer() {
  const doc = useDesignerStore((s) => s.doc);
  const addDataSource = useDesignerStore((s) => s.addDataSource);
  const removeDataSource = useDesignerStore((s) => s.removeDataSource);
  const setSampleData = useDesignerStore((s) => s.setSampleData);

  const [json, setJson] = useState<string>(`{
  "invoice": {
    "number": "INV-2024-001",
    "date": "2024-10-14",
    "customer": { "name": "Acme GmbH", "email": "billing@acme.de" },
    "items": [
      { "description": "Consulting", "qty": 10, "price": 120 },
      { "description": "Support",    "qty":  5, "price":  90 },
      { "description": "License",    "qty":  1, "price": 499 }
    ],
    "total": 1899
  }
}`);
  const [err, setErr] = useState<string>();

  const apply = () => {
    try {
      const parsed = JSON.parse(json);
      const schema = inferSchema(parsed, "data");
      const ds: DataSource = {
        id: nanoid(8),
        name: "Sample",
        kind: "json",
        sample: parsed,
        schema: schema.fields ?? [],
      };
      addDataSource(ds);
      setSampleData(parsed);
      setErr(undefined);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="rd-panel-body rd-scroll">
      <div className="rd-props-group-title">Sample Data (JSON)</div>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        style={{
          width: "100%", minHeight: 160, padding: 8,
          background: "var(--rd-panel-alt)", border: "1px solid var(--rd-border)",
          borderRadius: 6, color: "var(--rd-text)", fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          fontSize: 11, resize: "vertical",
        }}
      />
      {err && <div style={{ color: "var(--rd-danger)", fontSize: 11, margin: "4px 0" }}>{err}</div>}
      <button className="rd-btn rd-btn-primary" onClick={apply} style={{ marginTop: 6 }}>Apply & Preview</button>

      <div className="rd-props-group-title" style={{ marginTop: 16 }}>Sources</div>
      {doc.dataSources.length === 0 && (
        <div style={{ fontSize: 11, color: "var(--rd-muted)" }}>No data sources yet. Paste JSON above.</div>
      )}
      {doc.dataSources.map((ds) => (
        <div key={ds.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <strong style={{ fontSize: 12 }}>{ds.name}</strong>
            <span style={{ fontSize: 10, color: "var(--rd-muted)" }}>({ds.kind})</span>
            <span style={{ flex: 1 }} />
            <button className="rd-btn rd-icon" onClick={() => removeDataSource(ds.id)} title="Remove">×</button>
          </div>
          <div className="rd-tree">
            {(ds.schema ?? []).map((f) => (
              <FieldNode key={f.name} field={f} path="" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldNode({ field, path }: { field: DataField; path: string }) {
  const [open, setOpen] = useState(true);
  const fullPath = path ? `${path}.${field.name}` : field.name;
  const hasChildren = field.type === "object" || field.type === "array";
  const binding = `{{${fullPath}}}`;

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/x-rd-binding", binding);
    e.dataTransfer.setData("text/plain", binding);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div style={{ marginLeft: path ? 12 : 0 }}>
      <div className="rd-tree-node" draggable onDragStart={onDragStart} onClick={() => setOpen((v) => !v)}>
        <span className="rd-tree-caret">{hasChildren ? (open ? "▾" : "▸") : "•"}</span>
        <span>{field.name}</span>
        <span className="rd-tree-type">{field.type}</span>
      </div>
      {hasChildren && open && (field.fields ?? []).map((c) => (
        <FieldNode key={c.name} field={c} path={field.type === "array" ? `${fullPath}[0]` : fullPath} />
      ))}
    </div>
  );
}
