import { useState } from "react";
import { sanitizeElements, sanitizeReport, type ReportDocument } from "@reporting/schema";
import { useDesignerStore } from "../store/designerStore";
import type { AIProvider } from "../types";
import { SparkleIcon } from "./icons";

interface Props {
  ai?: AIProvider;
}

type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "error"; text: string };

export function AICopilot({ ai }: Props) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text:
        "Hi! Ich bin dein Report-Copilot. Beschreib mir den Bericht (z.B. \"Rechnung mit Logo oben rechts und Artikeltabelle\") oder verlange ein Restyling (\"moderner, Firmenfarben Blau/Grau\").",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const doc = useDesignerStore((s) => s.doc);
  const sampleData = useDesignerStore((s) => s.sampleData);
  const replaceDocument = useDesignerStore((s) => s.replaceDocument);
  const setDocument = useDesignerStore((s) => s.setDocument);

  const send = async (intent: "layout" | "restyle" | "map") => {
    const prompt = input.trim();
    if (!prompt && intent !== "map") return;
    setMessages((m) => [...m, { role: "user", text: prompt || `[Auto-map sample data]` }]);
    setInput("");
    setBusy(true);
    try {
      let result: ReportDocument;
      if (!ai) {
        result = heuristicGenerate(prompt, doc, intent, sampleData);
      } else if (intent === "layout") {
        result = await ai.generateReport(prompt, { document: doc, sampleData });
      } else if (intent === "restyle") {
        result = await ai.restyle(prompt, doc);
      } else {
        // Sanitize untrusted AI elements before appending them to the body.
        const els = sanitizeElements(await ai.mapData(sampleData));
        result = { ...doc, bands: doc.bands.map((b) => b.type === "body" ? { ...b, elements: [...b.elements, ...els] } : b) };
      }
      // Final gate: guarantee valid id/type/bounds regardless of the AI provider
      // (the relay bridge doesn't sanitize on its own).
      replaceDocument(sanitizeReport(result));
      setMessages((m) => [...m, { role: "assistant", text: "Fertig. Der Canvas wurde aktualisiert." }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "error", text: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rd-ai-panel">
      <div className="rd-ai-messages rd-scroll">
        {messages.map((m, i) => (
          <div key={i} className={`rd-ai-msg ${m.role === "user" ? "rd-user" : m.role === "error" ? "rd-error" : "rd-assistant"}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="rd-ai-msg rd-assistant">⏳ arbeite…</div>}
      </div>
      <div className="rd-ai-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Beschreibe dein Layout…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send("layout"); }
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 6, padding: "0 10px 10px" }}>
        <button className="rd-btn rd-btn-primary" disabled={busy} onClick={() => send("layout")}>
          <SparkleIcon size={14} /> Generate
        </button>
        <button className="rd-btn" disabled={busy} onClick={() => send("restyle")}>Restyle</button>
        <button className="rd-btn" disabled={busy || !sampleData} onClick={() => send("map")}>Auto-map</button>
      </div>
    </div>
  );
}

// ---- Heuristic fallback (no network) -------------------------------------
// Lets the designer run standalone without an API key. Generates plausible
// layouts from a few common prompts.

import { nanoid } from "nanoid";
import { createEmptyReport, type ReportElement } from "@reporting/schema";

function heuristicGenerate(
  prompt: string,
  current: ReportDocument,
  intent: "layout" | "restyle" | "map",
  sampleData?: unknown,
): ReportDocument {
  if (intent === "map") {
    return heuristicMap(sampleData);
  }
  if (intent === "restyle") {
    const wantsDark = /dark|dunkel|schwarz/i.test(prompt);
    const wantsBlue = /blau|blue/i.test(prompt);
    const accent = wantsBlue ? "#1d4ed8" : wantsDark ? "#111827" : "#4f46e5";
    return {
      ...current,
      bands: current.bands.map((b) => ({
        ...b,
        elements: b.elements.map((el) => restyle(el, accent)),
      })),
    };
  }

  const lower = prompt.toLowerCase();
  const invoice = lower.includes("rechnung") || lower.includes("invoice");
  const delivery = lower.includes("lieferschein") || lower.includes("delivery");
  const kind = invoice ? "Rechnung" : delivery ? "Lieferschein" : "Report";

  const doc = createEmptyReport(kind);
  const body = doc.bands.find((b) => b.type === "body")!;
  const header = doc.bands.find((b) => b.type === "pageHeader")!;

  header.height = 30;
  body.height = 180;

  header.elements.push(
    mk("text", { x: 10, y: 8, width: 90, height: 10 }, { value: kind, style: { fontSize: 20, fontWeight: 700, color: "#111827" } }),
    mk("text", { x: 10, y: 20, width: 120, height: 6 }, { value: "{{invoice.customer.name}}", style: { fontSize: 10, color: "#6b7280" } }),
    mk("image", { x: 160, y: 4, width: 30, height: 20 }, { source: "", fit: "contain" }),
    mk("line", { x: 10, y: 28, width: 190, height: 0.3 }, { color: "#e5e7eb", width: 0.3 }),
  );

  body.elements.push(
    mk("text", { x: 10, y: 4, width: 80, height: 5 }, { value: "Nummer: {{invoice.number}}", style: { fontSize: 10 } }),
    mk("text", { x: 10, y: 10, width: 80, height: 5 }, { value: "Datum: {{invoice.date}}", style: { fontSize: 10 } }),
    mk("table",
      { x: 10, y: 22, width: 190, height: 80 },
      {
        dataSource: "{{invoice.items}}",
        showHeader: true,
        headerHeight: 8,
        rowHeight: 7,
        alternateRowColor: "#f9fafb",
        columns: [
          { id: nanoid(6), header: "Beschreibung", cell: "{{row.description}}", width: 110 },
          { id: nanoid(6), header: "Menge",       cell: "{{row.qty}}",         width: 20 },
          { id: nanoid(6), header: "Preis",       cell: "{{row.price}}",       width: 25, format: "{0:C}" },
          { id: nanoid(6), header: "Summe",       cell: "= row.qty * row.price", width: 25, format: "{0:C}" },
        ],
      }),
    mk("text", { x: 130, y: 110, width: 70, height: 8 }, { value: "Total: {{invoice.total}}", format: "{0:C}", style: { fontSize: 12, fontWeight: 700, horizontalAlign: "right" } }),
  );

  const footer = doc.bands.find((b) => b.type === "pageFooter")!;
  footer.elements.push(
    mk("line", { x: 10, y: 2, width: 190, height: 0.3 }, { color: "#e5e7eb", width: 0.3 }),
    mk("text", { x: 10, y: 5, width: 190, height: 5 }, {
      value: "Seite – {{invoice.customer.name}}",
      style: { fontSize: 9, color: "#6b7280", horizontalAlign: "center" },
    }),
  );

  return doc;
}

// Build a simple key/value + table layout directly from a sample object,
// so "Auto-map" does something useful even without an AI provider.
function heuristicMap(sample: unknown): ReportDocument {
  const doc = createEmptyReport("Data Report");
  const body = doc.bands.find((b) => b.type === "body")!;
  if (!sample || typeof sample !== "object") {
    body.elements.push(mk("text", { x: 10, y: 6, width: 190, height: 8 }, { value: "No sample data to map." }));
    return doc;
  }
  // Unwrap a single root object (e.g. { invoice: {...} }) for nicer paths.
  const entries = Object.entries(sample as Record<string, unknown>);
  const [rootKey, rootVal] =
    entries.length === 1 && entries[0][1] && typeof entries[0][1] === "object"
      ? entries[0]
      : ["", sample];
  const prefix = rootKey ? `${rootKey}.` : "";
  const obj = rootVal as Record<string, unknown>;

  let y = 6;
  body.elements.push(
    mk("text", { x: 10, y, width: 190, height: 10 }, {
      value: rootKey || "Report",
      style: { fontSize: 18, fontWeight: 700, color: "#111827" },
    }),
  );
  y += 14;

  const arrays: [string, unknown[]][] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) { arrays.push([k, v]); continue; }
    if (v !== null && typeof v === "object") continue; // skip nested objects in the flat list
    body.elements.push(
      mk("text", { x: 10, y, width: 50, height: 6 }, { value: `${k}:`, style: { fontSize: 10, fontWeight: 600 } }),
      mk("text", { x: 62, y, width: 130, height: 6 }, { value: `{{${prefix}${k}}}`, style: { fontSize: 10 } }),
    );
    y += 7;
  }

  for (const [k, arr] of arrays) {
    const first = arr[0];
    const cols =
      first && typeof first === "object"
        ? Object.keys(first as Record<string, unknown>).filter((f) => {
            const fv = (first as Record<string, unknown>)[f];
            return fv === null || typeof fv !== "object";
          })
        : ["value"];
    y += 4;
    body.elements.push(
      mk("table", { x: 10, y, width: 190, height: 60 }, {
        dataSource: `{{${prefix}${k}}}`,
        showHeader: true,
        headerHeight: 8,
        rowHeight: 7,
        alternateRowColor: "#f9fafb",
        columns: cols.map((f) => ({
          id: nanoid(6),
          header: f,
          cell: `{{row.${f}}}`,
          width: Math.floor(180 / cols.length),
        })),
      }),
    );
    y += 64;
  }

  return doc;
}

function mk<T extends ReportElement["type"]>(
  type: T, bounds: { x: number; y: number; width: number; height: number }, extra: any,
): ReportElement {
  return { id: nanoid(8), type, bounds, ...extra } as ReportElement;
}

function restyle(el: ReportElement, accent: string): ReportElement {
  if (el.type === "text") {
    const isTitle = (el.style?.fontSize ?? 10) >= 16;
    return { ...el, style: { ...el.style, color: isTitle ? accent : el.style?.color ?? "#111827" } };
  }
  if (el.type === "line") return { ...el, color: accent };
  if (el.type === "rectangle") return { ...el, style: { ...el.style, borderColor: accent } };
  return el;
}
