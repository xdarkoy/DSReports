# Reporting – Der moderne Report Designer

Ein **webbasierter, KI-gestützter Report-Designer** als NPM-Paket mit nativer
Integration in **Visual Studio Code** und **Visual Studio 2022**. Inspiriert
von DevExpress XtraReports, Crystal Reports und SSRS – aber ohne die
Zeitmaschinen-Optik.

## Architektur

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│   ┌────────────────┐   ┌────────────────┐   ┌─────────────────┐    │
│   │   Web Demo     │   │  VS Code Ext.  │   │  Visual Studio  │    │
│   │   (Vite)       │   │  (WebView)     │   │  VSIX (WebView2)│    │
│   └───────┬────────┘   └───────┬────────┘   └───────┬─────────┘    │
│           │                    │                    │              │
│           └──────────────┬─────┴────────────────────┘              │
│                          │                                         │
│                  ┌───────▼────────┐                                │
│                  │ @reporting/    │ ← React component (npm pkg)    │
│                  │ designer       │   (Canvas, Toolbox, Props,     │
│                  │                │    Data Explorer, AI Copilot)  │
│                  └───────┬────────┘                                │
│           ┌──────────────┼──────────────────────┐                  │
│           │              │                      │                  │
│   ┌───────▼──────┐ ┌─────▼────────┐   ┌────────▼─────────┐         │
│   │ @reporting/  │ │ @reporting/  │   │ reporting-       │         │
│   │ schema       │ │ ai           │   │ backend (Python) │         │
│   │ (types)      │ │ (Claude)     │   │ → PDF            │         │
│   └──────────────┘ └──────────────┘   └──────────────────┘         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

Ein Report ist eine **JSON-Datei** (`*.myreport.json`). Beispiel:

```json
{
  "schemaVersion": "1.0.0",
  "meta": { "title": "Rechnung" },
  "page": { "size": "A4", "orientation": "portrait",
            "margin": { "top": 15, "right": 15, "bottom": 15, "left": 15 },
            "unit": "mm" },
  "dataSources": [],
  "parameters": [],
  "bands": [
    { "type": "pageHeader", "height": 30, "elements": [
        { "id": "t1", "type": "text", "bounds": { "x": 10, "y": 8, "width": 80, "height": 12 },
          "value": "Rechnung", "style": { "fontSize": 20, "fontWeight": "bold" } }
    ]},
    { "type": "body", "height": 180, "elements": [
        { "id": "tbl", "type": "table",
          "bounds": { "x": 10, "y": 20, "width": 190, "height": 60 },
          "dataSource": "{{invoice.items}}",
          "columns": [
            { "id": "c1", "header": "Beschreibung", "cell": "{{row.description}}", "width": 110 },
            { "id": "c2", "header": "Menge",        "cell": "{{row.qty}}",         "width": 20 },
            { "id": "c3", "header": "Preis",        "cell": "{{row.price}}",       "width": 25, "format": "{0:C}" },
            { "id": "c4", "header": "Summe",        "cell": "= row.qty * row.price", "width": 25, "format": "{0:C}" }
          ]}
    ]},
    { "type": "pageFooter", "height": 15, "elements": [] }
  ]
}
```

## Features (wie DevExpress XtraReports, nur schöner)

 - **Bands** – `pageHeader`, `reportHeader`, `body`, `reportFooter`, `pageFooter`
 - **Elemente** – Text, Image, Rectangle, Line, Barcode (Code128/QR/EAN13/…),
   Table (mit Zeilen-Binding), Chart (Bar/Line/Pie/Area/Doughnut), Page Break
 - **Bindings & Ausdrücke** – `{{invoice.customer.name}}`, `= row.qty * row.price`
 - **Formatierung** – `{0:C}` / `{0:N2}` / `yyyy-MM-dd`
 - **Special Fields** (à la Crystal Reports) – `{{Page}}`, `{{PageCount}}`,
   `{{PageNofM}}`, `{{PrintDate}}`, `{{PrintTime}}`, `{{ReportTitle}}`, sowie
   `{{RowNumber}}` in Tabellenzeilen
 - **Summary-/Footer-Zeilen** in Tabellen – pro Spalte `sum`/`avg`/`count`/
   `min`/`max` oder ein freier Footer-Text (z. B. „Gesamt:") für Total-Zeilen
 - **Conditional Formatting** (Crystal „Highlighting Expert") – Regeln pro
   Text/Zelle: `= row.total < 0` → rot/fett/Hintergrund
 - **Record Selection & Sortierung** – Tabellen-`filter` (`= row.qty > 0`) und
   Sortierung pro Feld (asc/desc)
 - **Running Totals** – laufende (kumulierte) Summe in einer Tabellenspalte
 - **Gruppierung mit Zwischensummen** – Tabelle nach Feld gruppieren
   (`groupBy`), Gruppen-Kopfzeile (`Kategorie: {{group}}`) und Subtotal-Zeile
   je Gruppe (nutzt die Spalten-`summary`)
 - **Parameter** – Report-Parameter (string/number/boolean/date) mit Wert,
   nutzbar in jedem Binding als `{{params.name}}`
 - **Multi-Page** – überlaufende Detail-Tabellen brechen im PDF über mehrere
   Seiten um; `pageHeader`/`pageFooter` wiederholen sich, `reportHeader` nur
   auf Seite 1, `reportFooter` + Gesamtsumme auf der letzten Seite; `{{Page}}`/
   `{{PageCount}}` zeigen echte Werte (Designer-Canvas zeigt Seite 1)
 - **Drag-and-drop** – Toolbox-Elemente *und* Datenfelder auf Bands/Elemente
 - **Snap-to-grid**, Arrow-Key-Nudging, Resize-Handles, Undo/Redo
 - **Data Explorer** – JSON paste-and-bind, Baumansicht, Drag von Feldern
 - **Property Grid** – alle Eigenschaften pro Selektion
 - **AI Copilot (Claude)** – Prompt-to-Layout, Restyle, Smart-Data-Mapping
 - **3 Hosts** – Standalone Web, VS Code (Custom Editor), Visual Studio (VSIX
   mit WebView2). Selber React-Code, drei Oberflächen.

## Monorepo-Struktur

```
Reporting/
├── packages/
│   ├── schema/            @reporting/schema  – Report-JSON-Typen
│   ├── designer/          @reporting/designer – React-Komponente (NPM)
│   └── ai/                @reporting/ai      – Claude-Anbindung
├── apps/
│   ├── web/               Standalone-Demo (Vite)
│   └── vscode-extension/  VS Code Extension (Custom Editor + WebView)
├── extensions/
│   └── visualstudio/      Visual Studio 2022 VSIX (C# + WebView2)
└── backend/               Python Renderer (FastAPI + ReportLab)
```

## Schnellstart

### 1. Web-Demo

```bash
npm install
npm run dev:web
# → http://localhost:5173
```

### 2. VS Code Extension

```bash
npm install
npm run build:vscode
code --install-extension apps/vscode-extension/*.vsix
```

In VS Code:

 1. `Ctrl+Shift+P` → **Report Designer: New Report**
 2. `Ctrl+Shift+P` → **Report Designer: Set Anthropic API Key** – der Schlüssel
    wird in der VS Code **SecretStorage** abgelegt (nicht in `settings.json`)
    und verlässt den Extension-Host nie.
 3. Datei `*.myreport.json` doppelklicken → der Designer öffnet sich inline.

### 3. Visual Studio 2022 Extension

```powershell
# Web-Bundle bauen …
npm run build:vscode
Copy-Item apps/vscode-extension/media/* extensions/visualstudio/Resources/webview/ -Force

# … dann das VSIX-Projekt in Visual Studio 2022 öffnen
# (Workload: "Visual Studio extension development")
#  ─ Build → extensions/visualstudio/bin/Debug/ReportDesigner.VsExtension.vsix
```

Installieren durch Doppelklick auf die `.vsix`. Einstellungen unter
**Tools → Options → Report Designer**.

### 4. Python-Render-Backend

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate
pip install -e .
python -m reporting_backend.server
# → http://127.0.0.1:8787/render
```

Sowohl VS Code als auch Visual Studio rufen dieses Endpoint beim Klick
auf **Preview** auf und öffnen das zurückgegebene PDF.

## Als NPM-Paket in deine eigene App einbetten

```bash
npm i @reporting/designer @reporting/schema
```

> ⚠️ **API-Key niemals im Browser-Bundle.** `createClaudeAI({ apiKey })` ruft
> die Anthropic-API direkt auf und gehört nur in eine Server-/Node-Umgebung.
> Im Browser den **Relay** verwenden (`createRelayAI`): Der Key bleibt auf dem
> Server, das Frontend spricht nur deinen eigenen Endpoint an.

```tsx
import { ReportDesigner } from "@reporting/designer";
import "@reporting/designer/styles.css";
import { createRelayAI } from "@reporting/ai";

// Key bleibt serverseitig; "/api/ai" proxyt zu Anthropic.
const ai = createRelayAI("/api/ai");

export default function App() {
  return (
    <div style={{ height: "100vh" }}>
      <ReportDesigner
        ai={ai}
        sampleData={{ invoice: { /* … */ } }}
        host={{
          onSave: (doc) => fetch("/api/reports", { method: "POST", body: JSON.stringify(doc) }),
          onRequestPreview: (doc) => fetch("/api/render", { method: "POST", body: JSON.stringify(doc) }),
        }}
      />
    </div>
  );
}
```

## Keyboard shortcuts

| Shortcut             | Action                        |
|----------------------|-------------------------------|
| `Ctrl+Z`             | Undo                          |
| `Ctrl+Y` / `Shift+Z` | Redo                          |
| `Ctrl+D`             | Duplicate selection           |
| `Delete`             | Delete selection              |
| Arrow keys           | Nudge 1 mm                    |
| `Shift` + arrows     | Nudge by grid size            |

## Roadmap

 - [ ] Group bands (`groupHeader`/`groupFooter`) für DevExpress-kompatible Sortier-/Gruppierungsreports
 - [ ] Sub-Reports
 - [ ] Formatting rules (bedingte Formatierung)
 - [ ] Parameter-Prompt-Dialog im Preview
 - [ ] XML-RDLC-Import-Konverter
 - [ ] Server-side chart rendering (Matplotlib) im Python-Backend

## Lizenz

Apache-2.0. Tue damit was Vernünftiges.
