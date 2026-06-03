# @xdarkoy/schema

The shared **report document schema** for the Reporting designer — TypeScript
types plus small runtime helpers. Consumed by both the React designer
(`@xdarkoy/designer`) and the Python render backend, so a report is one
portable JSON file (`*.myreport.json`).

```bash
npm i @xdarkoy/schema
```

## Document shape

```ts
interface ReportDocument {
  schemaVersion: "1.0.0";
  meta: { title: string; author?: string; /* … */ };
  page: { size: "A4"|"A5"|"A3"|"Letter"|"Legal"|{width;height}; orientation; margin; unit };
  dataSources: DataSource[];
  parameters: Parameter[];
  bands: Band[];                 // pageHeader, reportHeader, groupHeader, body, groupFooter, reportFooter, pageFooter
  grouping?: { dataSource: ValueExpr; field: string };  // band-level grouping
}
```

Element types: `text`, `image`, `rectangle`, `line`, `barcode`, `table`,
`chart`, `crosstab`, `subreport`, `pagebreak`.

## Helpers

```ts
import {
  createEmptyReport,        // (title?) => ReportDocument with default bands
  paperSizeMm,              // (size, orientation) => { width, height } in mm
  mmToPx, pxToMm,           // unit conversion (dpi default 96)
  isBindingExpression,      // (value) => boolean
  validateReport,          // (doc) => { ok: true } | { ok: false; error }
  resolveParameters,        // (parameters) => { name: value } for {{params.x}}
  sanitizeElement,          // coerce one untrusted element -> valid (id/type/bounds) or null
  sanitizeElements,         // coerce a list, dropping unsalvageable entries
  sanitizeReport,           // sanitize every element in a document's bands
  SCHEMA_VERSION, DEFAULT_PAGE,
} from "@xdarkoy/schema";

const doc = createEmptyReport("Rechnung");
```

`sanitize*` are useful when ingesting **untrusted/AI‑generated** documents
before handing them to the renderer or UI.

## Bindings & expressions (used in element values)
- Interpolation: `"Hallo {{invoice.customer.name}}"`
- Expression: `"= row.qty * row.price"` (arithmetic, comparison, `&& || !`,
  ternary, functions `abs round floor ceil sqrt min max`; `**` is intentionally
  unsupported)
- Formatting: `"{0:C}"`, `"{0:N2}"`, `"{0:P}"`, `"yyyy-MM-dd"`
- Special fields: `{{Page}}`, `{{PageCount}}`, `{{PageNofM}}`, `{{PrintDate}}`,
  `{{PrintTime}}`, `{{ReportTitle}}`, `{{RowNumber}}` (in table rows),
  `{{group}}`/`{{groupItems}}`/`{{GroupCount}}` (in group bands)

See **[docs/USAGE.md](../../docs/USAGE.md)** for the full guide.

Licensed under Apache‑2.0.
