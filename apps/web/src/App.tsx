import { useState } from "react";
import { ReportDesigner, type ReportDocument } from "@reporting/designer";

// Python render backend (see backend/README.md). Override with VITE_RENDER_URL.
const RENDER_URL = import.meta.env.VITE_RENDER_URL ?? "http://127.0.0.1:8787/render";

const SAMPLE = {
  invoice: {
    number: "INV-2024-001",
    date: "2024-10-14",
    customer: { name: "Acme GmbH", email: "billing@acme.de" },
    items: [
      { description: "Consulting", qty: 10, price: 120 },
      { description: "Support",    qty:  5, price:  90 },
      { description: "License",    qty:  1, price: 499 },
    ],
    total: 1899,
  },
};

export function App() {
  const [doc, setDoc] = useState<ReportDocument>();

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <ReportDesigner
        sampleData={SAMPLE}
        onDocumentChange={setDoc}
        host={{
          onSave: (d) => {
            const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${d.meta.title || "report"}.myreport.json`;
            a.click();
            URL.revokeObjectURL(url);
          },
          onRequestPreview: async (d) => {
            try {
              const res = await fetch(RENDER_URL, {
                method: "POST",
                headers: { "content-type": "application/json" },
                // Send the demo sample data so {{invoice.*}} bindings resolve
                // in the rendered PDF.
                body: JSON.stringify({ document: d, data: SAMPLE }),
              });
              if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              window.open(url, "_blank");
              // Revoke a little later so the new tab has time to load it.
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
            } catch (e) {
              alert(
                `PDF-Preview fehlgeschlagen: ${(e as Error).message}\n\n` +
                  `Läuft das Render-Backend? → cd backend && python -m reporting_backend.server\n` +
                  `(erwartet unter ${RENDER_URL})`,
              );
            }
          },
        }}
      />
    </div>
  );
}
