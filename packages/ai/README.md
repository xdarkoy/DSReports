# @xdarkoy/ai

Optional **AI copilot** bindings for `@xdarkoy/designer` — prompt‑to‑layout,
restyle and smart data mapping, backed by Claude. Two implementations:

- `createClaudeAI` — calls the Anthropic SDK directly. **Server/Node only**
  (your API key would otherwise ship to the browser).
- `createRelayAI` — calls **your** HTTP endpoint, which proxies to Claude.
  Use this in the browser so the key stays on the server.

```bash
npm i @xdarkoy/ai
# createClaudeAI also needs the SDK (peer, optional):
npm i @anthropic-ai/sdk
```

## Browser (recommended): relay

```tsx
import { createRelayAI } from "@xdarkoy/ai";
const ai = createRelayAI("/api/ai");   // your endpoint forwards {action, payload} to Claude
<ReportDesigner ai={ai} />
```

Your `/api/ai` handler receives `{ action: "generate"|"suggest"|"restyle"|"map", payload }`
and should return the model's JSON. Keep the Anthropic key on the server.

## Server / Node: direct

```ts
import { createClaudeAI } from "@xdarkoy/ai";
const ai = createClaudeAI({ apiKey: process.env.ANTHROPIC_API_KEY, model: "claude-sonnet-4-6" });
```

`ClaudeAIOptions`: `apiKey`, `model`, `maxTokens`, `system`, `fetch`,
`dangerouslyAllowBrowser` (do **not** enable in a real browser bundle).

## The `AIProvider` interface (what the designer calls)

```ts
interface AIProvider {
  generateReport(prompt, ctx?): Promise<ReportDocument>;
  suggestElements(prompt, ctx?): Promise<ReportElement[]>;
  restyle(prompt, doc): Promise<ReportDocument>;
  mapData(sample): Promise<ReportElement[]>;
}
```

All results are run through `sanitizeReport`/`sanitizeElements`
(`@xdarkoy/schema`) so malformed model output can't reach the renderer.

See **[docs/USAGE.md](https://github.com/xdarkoy/DSReports/blob/main/docs/USAGE.md)**.

Licensed under Apache‑2.0.
