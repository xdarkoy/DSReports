/**
 * @reporting/ai – Claude-backed AIProvider for the designer.
 *
 * The designer itself defines the AIProvider interface (to avoid a hard
 * dependency on any SDK). This package provides an optional, batteries-included
 * implementation on top of the Anthropic SDK.
 */

import {
  createEmptyReport,
  type ReportDocument,
  type ReportElement,
} from "@reporting/schema";

// keep SDK import lazy to avoid bundling it into the designer when unused.
type AnthropicClient = {
  messages: {
    create: (req: any) => Promise<{ content: Array<{ type: string; text: string }> }>;
  };
};

export interface ClaudeAIOptions {
  apiKey?: string;
  model?: string;
  /** Override fetch for sandboxed hosts (e.g. VS Code extension host). */
  fetch?: typeof fetch;
  /** Allow browser use. You must accept responsibility for API key exposure. */
  dangerouslyAllowBrowser?: boolean;
  /** Optional system prompt override. */
  system?: string;
  /** Max tokens per response. */
  maxTokens?: number;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a report layout assistant for a modern report designer.
Your job: produce a JSON document conforming EXACTLY to the "ReportDocument" schema below.
ALWAYS respond with ONLY a single JSON object – no prose, no markdown fences.

Coordinate system is millimetres, origin top-left of the page.
Use A4 portrait (210 x 297) unless the user says otherwise.
Bands are one of: pageHeader, reportHeader, body, reportFooter, pageFooter.
Values can be literals, interpolations "{{path.to.field}}" or expressions "= row.qty * row.price".
Special fields (Crystal-Reports-style) are available in any binding: {{Page}}, {{PageCount}}, {{PageNofM}}, {{PrintDate}}, {{PrintTime}}, {{ReportTitle}}, and {{RowNumber}} inside table rows.
Tables support a summary row: set the table's "showFooter": true and give numeric columns a "summary" of "sum"|"avg"|"count"|"min"|"max" (or a literal "footer" string like "Gesamt:").
Tables can also "filter" rows ("= row.qty > 0") and "sort" them ([{"field":"price","dir":"desc"}]); a column may set "runningTotal": true for a cumulative total.
Conditional formatting: text elements and table columns accept "conditional": [{ "when": "= row.total < 0", "style": { "color": "#ff0000", "fontWeight": "bold", "backgroundColor": "#fee" } }].
Grouping: a table may set "groupBy": "category" with "groupHeader": "Kategorie: {{group}}" and "showGroupFooter": true to render a header + subtotal row per group (subtotals use each column's "summary").
Parameters: define report parameters in "parameters": [{ "id": "...", "name": "year", "type": "number", "defaultValue": 2024 }] and reference them anywhere as {{params.year}}.
Cross-tab element: { "type": "crosstab", "dataSource": "{{sales}}", "rowField": "category", "columnField": "month", "valueField": "amount", "aggregate": "sum", "showRowTotals": true, "showColumnTotals": true, "format": "{0:N2}" } renders a pivot matrix (rowField × columnField, aggregated valueField).
Sub-report element: { "type": "subreport", "dataSource": "{{order.customer}}", "document": <a nested ReportDocument> } embeds the nested report's content bands, bound to the resolved data slice (its fields are directly available in the nested bindings).

Schema (condensed):
{
  "schemaVersion": "1.0.0",
  "meta": { "title": string, "author"?: string },
  "page": { "size": "A4"|"A5"|"A3"|"Letter"|"Legal", "orientation": "portrait"|"landscape",
            "margin": { "top": n, "right": n, "bottom": n, "left": n }, "unit": "mm" },
  "dataSources": [],
  "parameters": [],
  "bands": [
    { "type": "pageHeader"|"body"|"pageFooter", "height": number, "elements": [
       { "id": string, "type": "text", "bounds": {"x","y","width","height"},
         "value": string, "format"?: string,
         "style"?: { "fontSize"?: number, "fontWeight"?: "bold"|number, "color"?: "#hex",
                     "horizontalAlign"?: "left"|"center"|"right", "backgroundColor"?: "#hex" } },
       { "id": string, "type": "image", "bounds": {...}, "source": string, "fit"?: "contain"|"cover"|"fill" },
       { "id": string, "type": "rectangle", "bounds": {...}, "style"?: {...} },
       { "id": string, "type": "line", "bounds": {...}, "color"?: "#hex", "width"?: number, "direction"?: "horizontal"|"vertical" },
       { "id": string, "type": "barcode", "bounds": {...}, "value": string, "symbology": "code128"|"qrcode"|"ean13" },
       { "id": string, "type": "table", "bounds": {...}, "dataSource": string, "rowHeight": n, "headerHeight": n,
         "columns": [ { "id": string, "header": string, "cell": string, "width": n, "format"?: string } ] },
       { "id": string, "type": "chart", "bounds": {...}, "kind": "bar"|"line"|"pie",
         "dataSource": string, "categoryField": string, "valueField": string }
    ] }
  ]
}

id must be a random 8-char alphanumeric string, unique per element.`;

export function createClaudeAI(opts: ClaudeAIOptions = {}) {
  const model = opts.model ?? DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 4096;

  const getClient = async (): Promise<AnthropicClient> => {
    const mod = await import("@anthropic-ai/sdk").catch(() => null);
    if (!mod) throw new Error("@anthropic-ai/sdk is not installed. `npm i @anthropic-ai/sdk`.");
    const Anthropic = (mod as any).default ?? (mod as any).Anthropic;
    const apiKey = opts.apiKey ?? (globalThis as any)?.process?.env?.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY.");
    return new Anthropic({
      apiKey,
      fetch: opts.fetch,
      dangerouslyAllowBrowser: opts.dangerouslyAllowBrowser,
    });
  };

  const ask = async (user: string, system = opts.system ?? SYSTEM_PROMPT): Promise<string> => {
    const client = await getClient();
    const resp = await client.messages.create({
      model, max_tokens: maxTokens, system,
      messages: [{ role: "user", content: user }],
    });
    const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return text.trim();
  };

  const parseDoc = (raw: string): ReportDocument => {
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end < 0) throw new Error("AI response did not contain JSON.");
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as ReportDocument;
    // Defensive: fill in anything missing so we never hand the designer a half-doc.
    const base = createEmptyReport(parsed.meta?.title ?? "AI Report");
    return {
      schemaVersion: "1.0.0",
      meta: { ...base.meta, ...parsed.meta },
      page: { ...base.page, ...parsed.page, margin: { ...base.page.margin, ...(parsed.page?.margin ?? {}) } },
      dataSources: parsed.dataSources ?? [],
      parameters: parsed.parameters ?? [],
      bands: parsed.bands?.length ? parsed.bands : base.bands,
    };
  };

  return {
    async generateReport(prompt: string, context?: { document?: ReportDocument; sampleData?: unknown }) {
      const user =
        `Design a report for this request: "${prompt}"` +
        (context?.sampleData ? `\n\nSample data (JSON):\n${JSON.stringify(context.sampleData, null, 2)}` : "") +
        (context?.document ? `\n\nCurrent document (for reference, may be replaced):\n${JSON.stringify(context.document)}` : "");
      return parseDoc(await ask(user));
    },
    async suggestElements(prompt: string, context?: { document?: ReportDocument; sampleData?: unknown }): Promise<ReportElement[]> {
      const user =
        `Return ONLY a JSON array of ReportElement objects to add to the body band.\n` +
        `Intent: "${prompt}"` +
        (context?.sampleData ? `\n\nSample data: ${JSON.stringify(context.sampleData)}` : "");
      const raw = await ask(user);
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start < 0 || end < 0) throw new Error("AI response did not contain a JSON array.");
      return JSON.parse(raw.slice(start, end + 1));
    },
    async restyle(prompt: string, doc: ReportDocument): Promise<ReportDocument> {
      const user =
        `Restyle the following report. Keep structure & bindings; change only visual properties ` +
        `(colors, font sizes, weights, borders). Request: "${prompt}".\n\n${JSON.stringify(doc)}`;
      return parseDoc(await ask(user));
    },
    async mapData(sample: unknown): Promise<ReportElement[]> {
      const user =
        `Given this JSON sample, propose a list of ReportElement objects for the body band that ` +
        `bind to the data in a useful way (title, key/value pairs, and a table for any array fields). ` +
        `Return ONLY a JSON array.\n\n${JSON.stringify(sample, null, 2)}`;
      const raw = await ask(user);
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start < 0 || end < 0) throw new Error("AI response did not contain a JSON array.");
      return JSON.parse(raw.slice(start, end + 1));
    },
  };
}

/**
 * Bridge implementation that calls an HTTP endpoint instead of the SDK directly.
 * Useful from browsers: keep the API key on the server.
 */
export function createRelayAI(url: string, fetchImpl: typeof fetch = fetch) {
  const post = async <T,>(action: string, payload: unknown): Promise<T> => {
    const r = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    if (!r.ok) throw new Error(`AI relay error: ${r.status} ${await r.text()}`);
    return (await r.json()) as T;
  };

  return {
    generateReport: (prompt: string, context?: any) => post<ReportDocument>("generate", { prompt, context }),
    suggestElements: (prompt: string, context?: any) => post<ReportElement[]>("suggest", { prompt, context }),
    restyle: (prompt: string, doc: ReportDocument) => post<ReportDocument>("restyle", { prompt, doc }),
    mapData: (sample: unknown) => post<ReportElement[]>("map", { sample }),
  };
}
