# Usage guide

How to use the Reporting designer end‑to‑end: embed it, author a report, bind
data, use expressions and all the Crystal‑Reports‑style features, render to PDF,
and wire the AI copilot.

- [1. Install & embed](#1-install--embed)
- [2. The report document](#2-the-report-document)
- [3. Bands](#3-bands)
- [4. Elements](#4-elements)
- [5. Data binding](#5-data-binding)
- [6. Expressions & formatting](#6-expressions--formatting)
- [7. Special fields](#7-special-fields)
- [8. Tables: summaries, running totals, conditional formatting, sort/filter, grouping](#8-tables)
- [9. Cross‑tab (pivot)](#9-cross-tab-pivot)
- [10. Sub‑reports](#10-sub-reports)
- [11. Parameters](#11-parameters)
- [12. Band‑level grouping](#12-band-level-grouping)
- [13. Multi‑page pagination](#13-multi-page-pagination)
- [14. Conditional visibility & read‑only](#14-conditional-visibility--read-only)
- [15. The AI copilot](#15-the-ai-copilot)
- [16. The PDF render backend](#16-the-pdf-render-backend)
- [17. Hosts: web, VS Code, Visual Studio](#17-hosts)

---

## 1. Install & embed

```bash
npm i @xdarkoy/designer @xdarkoy/schema react react-dom
npm i @xdarkoy/ai            # optional copilot
```

```tsx
import { ReportDesigner } from "@xdarkoy/designer";
import "@xdarkoy/designer/styles.css";

<div style={{ height: "100vh" }}>
  <ReportDesigner
    sampleData={SAMPLE}
    onDocumentChange={(doc) => save(doc)}
    host={{ onSave, onRequestPreview }}
  />
</div>
```

Controlled vs uncontrolled: pass `document` (controlled — the designer re‑syncs
when it changes) **or** `initialDocument` (uncontrolled). `onDocumentChange`
fires on every edit.

## 2. The report document

A report is a JSON object (`*.myreport.json`) of type `ReportDocument`:

```jsonc
{
  "schemaVersion": "1.0.0",
  "meta": { "title": "Rechnung" },
  "page": { "size": "A4", "orientation": "portrait",
            "margin": { "top": 15, "right": 15, "bottom": 15, "left": 15 }, "unit": "mm" },
  "dataSources": [],
  "parameters": [],
  "bands": [ /* … */ ]
}
```

Create one in code: `createEmptyReport("Rechnung")`. Coordinates are
**millimetres**, origin top‑left.

## 3. Bands

Bands stack the page top→bottom. Available types (canonical order):

`pageHeader` · `reportHeader` · `groupHeader` · `body` · `groupFooter` ·
`reportFooter` · `pageFooter`

`pageHeader`/`pageFooter` repeat on every page; `reportHeader` only on the first
page; `reportFooter` only on the last; `groupHeader`/`groupFooter` repeat per
group (see [§12](#12-band-level-grouping)). A new report starts with
`pageHeader` / `body` / `pageFooter`.

## 4. Elements

Drag from the Toolbox onto a band. Each element has `bounds {x,y,width,height}`
(mm), optional `visible`/`visibleIf`, `locked`, `zIndex`.

| Type | Key fields |
|------|-----------|
| `text` | `value`, `format`, `style`, `conditional` |
| `image` | `source` (URL / `data:` / binding), `fit` |
| `rectangle` / `line` | `style` / `color`,`width`,`direction` |
| `barcode` | `value`, `symbology` (code128, qrcode, ean13, …) |
| `table` | `dataSource`, `columns`, summaries, grouping, … (see §8) |
| `chart` | `kind` (bar/line/pie/…), `dataSource`, `categoryField`, `valueField` |
| `crosstab` | pivot matrix (see §9) |
| `subreport` | nested report (see §10) |
| `pagebreak` | layout marker |

## 5. Data binding

Open **Data**, paste a JSON sample, **Apply & Preview**. Then **drag a field**
onto the canvas:
- an **array of objects** (e.g. `items`) → creates a **table** with columns
  auto‑generated from the row keys, or sets the `dataSource` of the table you
  drop it on;
- a **scalar field** → creates a bound **text** element, or sets the target
  element's value/source.

Bindings use the field path: `{{invoice.customer.name}}`, `{{items[0].price}}`.

## 6. Expressions & formatting

A value can be a literal, an interpolation, or an expression:

```
"Plain text"
"Hallo {{user.name}}"
"= row.qty * row.price"
```

Expression grammar: `+ - * / %`, comparisons `== != < <= > >=`, logical
`&& || !`, ternary `cond ? a : b`, member/index access, and the pure functions
`abs round floor ceil sqrt min max`. (`**` is intentionally unsupported — no
exponential DoS; there is no access to globals/`fetch`.)

Formatting (`format` field): `{0:C}` currency (e.g. `1,234.56 €`), `{0:N2}`
fixed decimals, `{0:P}` percent, and date masks `yyyy-MM-dd`, `HH:mm:ss`.
Designer preview and the PDF backend produce identical output.

## 7. Special fields

Usable in **any** binding (Crystal‑Reports style):

| Field | Meaning |
|-------|---------|
| `{{Page}}` / `{{PageCount}}` | current / total pages |
| `{{PageNofM}}` | "1 / 3" |
| `{{PrintDate}}` / `{{PrintTime}}` | render date / time |
| `{{ReportTitle}}` | `meta.title` |
| `{{RowNumber}}` | row index inside a table |

Example footer text: `Seite {{PageNofM}} — {{ReportTitle}}`.

## 8. Tables

`dataSource` binds the rows (`{{invoice.items}}`); each column has `header`,
`cell` (e.g. `{{row.price}}` or `= row.qty * row.price`), `width`, `format`.

- **Summary/footer row** — set `showFooter: true`; give numeric columns a
  `summary` of `sum`/`avg`/`count`/`min`/`max`, or a literal `footer` label
  (e.g. "Gesamt:").
- **Running total** — column option `runningTotal: true` (cumulative sum).
- **Conditional formatting** ("Highlighting Expert") — per column `conditional`:
  `[{ "when": "= row.total < 0", "style": { "color": "#ff0000", "fontWeight": "bold" } }]`.
  Also available on `text` elements.
- **Record selection & sort** — table `filter` (`= row.qty > 0`) and `sort`
  (`[{ "field": "price", "dir": "desc" }]`).
- **In‑table grouping with subtotals** — `groupBy: "category"`,
  `groupHeader: "Kategorie: {{group}}"`, `showGroupFooter: true` (subtotals use
  each column's `summary`).

## 9. Cross‑tab (pivot)

```jsonc
{ "type": "crosstab", "dataSource": "{{sales}}",
  "rowField": "category", "columnField": "month", "valueField": "amount",
  "aggregate": "sum", "showRowTotals": true, "showColumnTotals": true, "format": "{0:N2}" }
```

Distinct `rowField` × `columnField` values form the matrix; each cell aggregates
`valueField`, with optional row/column totals and a grand total.

## 10. Sub‑reports

```jsonc
{ "type": "subreport", "dataSource": "{{order.customer}}", "document": <nested ReportDocument> }
```

Renders the nested report's content bands inside the element bounds, bound to the
resolved data slice (the object's fields are available directly in the nested
bindings). Nesting depth is capped (8) as a safety guard. The nested layout is
authored via JSON or the AI copilot.

## 11. Parameters

Define in **Properties → Parameters** (or in `parameters[]`): `name`, `type`
(`string`/`number`/`boolean`/`date`), `prompt`, value. Reference anywhere as
`{{params.name}}`. Values are type‑coerced for the canvas and the PDF.

## 12. Band‑level grouping

Set top‑level `grouping` and add `groupHeader`/`groupFooter` bands:

```jsonc
"grouping": { "dataSource": "{{sales}}", "field": "region" }
```

For each group the `groupHeader` → `body` → `groupFooter` bands render, with a
page break between groups. Inside those bands: `{{group}}` (the value),
`{{groupItems}}` (bind a table's `dataSource` to it), `{{GroupCount}}`.

## 13. Multi‑page pagination

When a (non‑grouped) detail `table` in the body has more rows than fit, the PDF
splits it across pages: `pageHeader`/`pageFooter` repeat, `reportHeader` is
page‑1 only, `reportFooter` + the table summary are last‑page only, and
`{{Page}}`/`{{PageCount}}` show real values. (The designer canvas shows page 1.)

## 14. Conditional visibility & read‑only

- `visible: false` hides an element; `visibleIf: "= row.total > 0"` hides it
  conditionally. Hidden elements are dimmed on the canvas, omitted from the PDF.
- `<ReportDesigner readOnly />` blocks **all** document edits (enforced in the
  store — drag, keyboard, property edits, undo/redo all no‑op).

## 15. The AI copilot

Pass an `ai` provider (see [@xdarkoy/ai](../packages/ai/README.md)). In the
browser use `createRelayAI("/api/ai")` so the Anthropic key stays server‑side.
Buttons: **Generate** (prompt → layout), **Restyle**, **Auto‑map** (sample data
→ elements). Without a provider, a built‑in heuristic produces plausible
invoice/list layouts offline. All AI output is sanitized before it touches the
document.

## 16. The PDF render backend

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate
pip install -e .
python -m reporting_backend.server      # http://127.0.0.1:8787
```

`POST /render` with `{ "document": <ReportDocument>, "data": <optional> }` →
`application/pdf`. Malformed documents return **400** (validated up front).
Security: CORS is an allowlist (`REPORT_CORS_ORIGINS`, default localhost:5173);
image sources are restricted — `data:` allowed, remote off by default
(`REPORT_IMAGE_ALLOW_REMOTE=1` + `REPORT_IMAGE_HOST_ALLOWLIST=host1,host2`),
local files / SSRF (private/loopback IPs) blocked.

Wire it from the designer's `host.onRequestPreview`:
```tsx
onRequestPreview: (doc) =>
  fetch("http://127.0.0.1:8787/render", { method: "POST", body: JSON.stringify({ document: doc }) })
    .then((r) => r.blob()).then((b) => window.open(URL.createObjectURL(b)))
```

## 17. Hosts

The same React designer runs in three hosts:
- **Web** — embed `<ReportDesigner>` in any React app (this guide).
- **VS Code** — custom editor for `*.myreport.json`; *New Report* and
  *Set Anthropic API Key* commands; preview via the Python backend.
- **Visual Studio 2022** — VSIX with WebView2 hosting the same bundle.

See the root [README](../README.md) for per‑host build/run steps and
[docs/PUBLISHING.md](./PUBLISHING.md) for releasing the npm packages.
