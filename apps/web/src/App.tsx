import { useState } from "react";
import { ReportDesigner, type ReportDocument } from "@reporting/designer";

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
          onRequestPreview: (d) => {
            console.log("Preview requested", d);
            alert("Preview würde ans Python-Backend gesendet.");
          },
        }}
      />
    </div>
  );
}
