import { useEffect, useState } from "react";
import { ReportDesigner, type ReportDocument } from "@xdarkoy/designer";
// With the source alias (vite.config.ts) the CSS is pulled in via the designer
// entrypoint. In a standalone app using the published package, add instead:
//   import "@xdarkoy/designer/styles.css";

const API = "http://127.0.0.1:8790";

interface InvoiceRow {
  id: number;
  number: string;
  customer: string;
}

export function App() {
  const [doc, setDoc] = useState<ReportDocument>();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [selected, setSelected] = useState<number>();
  const [data, setData] = useState<unknown>();
  const [error, setError] = useState<string>();

  // load the report template + the invoice list from the DB API
  useEffect(() => {
    fetch(`${API}/template`).then((r) => r.json()).then(setDoc)
      .catch(() => setError("API nicht erreichbar — läuft der Server auf :8790?"));
    fetch(`${API}/invoices`).then((r) => r.json()).then((list: InvoiceRow[]) => {
      setInvoices(list);
      if (list[0]) setSelected(list[0].id);
    }).catch(() => {});
  }, []);

  // load the selected invoice's data (live from SQLite) for the canvas preview
  useEffect(() => {
    if (selected == null) return;
    fetch(`${API}/invoices/${selected}/data`).then((r) => r.json()).then(setData).catch(() => {});
  }, [selected]);

  const previewPdf = async () => {
    if (selected == null) return;
    const res = await fetch(`${API}/invoices/${selected}/render`, { method: "POST" });
    if (!res.ok) { alert(`Render fehlgeschlagen: ${res.status}`); return; }
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (error) return <div style={{ padding: 24, font: "14px system-ui", color: "#b91c1c" }}>{error}</div>;
  if (!doc) return <div style={{ padding: 24, font: "14px system-ui" }}>Lade…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #e5e7eb", font: "13px system-ui" }}>
        <strong>Rechnung (aus SQLite):</strong>
        <select value={selected ?? ""} onChange={(e) => setSelected(Number(e.target.value))}>
          {invoices.map((i) => <option key={i.id} value={i.id}>{i.number} — {i.customer}</option>)}
        </select>
        <span style={{ color: "#6b7280" }}>
          Daten kommen live aus der DB; „Preview" rendert das PDF serverseitig aus der DB.
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ReportDesigner
          document={doc}
          sampleData={data}
          host={{ onRequestPreview: previewPdf }}
        />
      </div>
    </div>
  );
}
