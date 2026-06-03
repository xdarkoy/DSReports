# @xdarkoy/designer

A modern, embeddable **React report designer** — bands, drag‑and‑drop elements,
data binding, expressions, tables with grouping/subtotals, cross‑tabs,
sub‑reports, conditional formatting and an optional AI copilot. The same JSON
document (`*.myreport.json`) renders to PDF via the companion Python backend.

```bash
npm i @xdarkoy/designer @xdarkoy/schema react react-dom
# optional AI copilot:
npm i @xdarkoy/ai
```

> Requires React ≥ 18 (peer dependency).

## Quick start

```tsx
import { ReportDesigner, type ReportDocument } from "@xdarkoy/designer";
import "@xdarkoy/designer/styles.css";

export default function App() {
  return (
    <div style={{ height: "100vh" }}>
      <ReportDesigner
        sampleData={{ invoice: { number: "INV-1", items: [{ description: "Beratung", qty: 2, price: 90 }] } }}
        onDocumentChange={(doc: ReportDocument) => console.log(doc)}
        host={{
          onSave: (doc) => fetch("/api/reports", { method: "POST", body: JSON.stringify(doc) }),
          onRequestPreview: (doc) =>
            fetch("http://127.0.0.1:8787/render", { method: "POST", body: JSON.stringify({ document: doc }) })
              .then((r) => r.blob())
              .then((b) => window.open(URL.createObjectURL(b))),
        }}
      />
    </div>
  );
}
```

`import "@xdarkoy/designer/styles.css"` once (the designer's CSS).

## `<ReportDesigner>` props

| Prop | Type | Notes |
|------|------|-------|
| `document` | `ReportDocument` | Controlled mode — re‑syncs when the prop changes. |
| `initialDocument` | `ReportDocument` | Uncontrolled initial value. |
| `onDocumentChange` | `(doc) => void` | Fires on every document change. |
| `sampleData` | `unknown` | Design‑time data for bindings/preview. |
| `ai` | `AIProvider` | Optional copilot (see `@xdarkoy/ai`). |
| `host` | `HostBridge` | `onSave`, `onChange`, `onRequestPreview`, `resolveAsset`. |
| `readOnly` | `boolean` | Blocks **all** document edits (enforced in the store). |
| `layout` | `{ toolbox?, properties?, dataExplorer?, aiCopilot?, topbar? }` | Hide panels. |
| `className` | `string` | Extra class on the root. |

## Keyboard shortcuts

`Ctrl+Z` undo · `Ctrl+Y` / `Shift+Z` redo · `Ctrl+D` duplicate · `Delete`
delete · arrows nudge 1 mm · `Shift`+arrows nudge by grid.

## Where things live
- Report document shape & helpers: **[@xdarkoy/schema](../schema/README.md)**
- AI copilot bindings: **[@xdarkoy/ai](../ai/README.md)**
- Full feature guide (bindings, special fields, grouping, cross‑tab, …):
  **[docs/USAGE.md](../../docs/USAGE.md)**

Licensed under Apache‑2.0.
