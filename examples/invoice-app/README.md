# Invoice example — report bound to a database

A small end-to-end example: a **SQLite** database of customers/invoices/items,
a data+render API, and a web app that embeds `@xdarkoy/designer`, shows the
report with **live DB data**, and renders the PDF **server-side from the DB**.

```
examples/invoice-app/
├── server.py       # FastAPI + SQLite (auto-seeded) + reporting_backend renderer
├── template.json   # the invoice report (header, customer, items table w/ summary, page footer)
├── src/App.tsx     # embeds <ReportDesigner>, lists invoices, live data + PDF preview
└── …
```

## Run

**1) Data + render API** (uses the backend venv — it has fastapi + reporting_backend):
```powershell
cd D:\Projekti\DSReports\DSReports
backend\.venv\Scripts\python.exe examples\invoice-app\server.py
# -> http://127.0.0.1:8790  (creates invoices.db on first run)
```

**2) Web app** (workspace; from the repo root):
```powershell
npm install                                   # once, links the workspace
npm run dev --workspace @xdarkoy/example-invoice-app
# -> http://localhost:5174
```

Pick an invoice in the top bar → the canvas shows it with data straight from
SQLite → **Preview** opens the PDF rendered server-side from the database.

## What it demonstrates
- Embedding the designer (`<ReportDesigner document=… sampleData=… host=…>`)
- Real DB binding: `{{invoice.customer.name}}`, a table bound to
  `{{invoice.items}}`, a `sum` summary row, conditional bold on large line
  totals, `{{PageNofM}}`/`{{PrintDate}}` in the footer
- Server-side PDF: `render_report_to_pdf(template, dbData)`

## Going standalone (after `npm publish`)
This example resolves `@xdarkoy/*` from the workspace source (Vite aliases in
`vite.config.ts`). In a real external app, delete those aliases and just:
```bash
npm i @xdarkoy/designer @xdarkoy/schema react react-dom
```
