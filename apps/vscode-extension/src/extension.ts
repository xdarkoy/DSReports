import * as vscode from "vscode";
import * as path from "path";
import * as crypto from "crypto";
import { TextEncoder, TextDecoder } from "util";
import { validateReport } from "@xdarkoy/schema";

const API_KEY_SECRET = "reporting.anthropicApiKey";

/**
 * Resolve the Anthropic API key from SecretStorage, transparently migrating a
 * legacy plaintext `reporting.anthropicApiKey` setting into secret storage and
 * clearing it from settings.json.
 */
async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const stored = await context.secrets.get(API_KEY_SECRET);
  if (stored) return stored;
  const legacy = vscode.workspace.getConfiguration("reporting").get<string>("anthropicApiKey");
  if (legacy) {
    await context.secrets.store(API_KEY_SECRET, legacy);
    await vscode.workspace
      .getConfiguration("reporting")
      .update("anthropicApiKey", undefined, vscode.ConfigurationTarget.Global)
      .then(undefined, () => {/* setting may be read-only; key is already migrated */});
    return legacy;
  }
  return undefined;
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(ReportDesignerEditor.register(context));

  context.subscriptions.push(
    vscode.commands.registerCommand("reporting.setApiKey", async () => {
      const value = await vscode.window.showInputBox({
        title: "Anthropic API Key",
        prompt: "Stored securely in VS Code SecretStorage (not in settings.json).",
        password: true,
        ignoreFocusOut: true,
      });
      if (value === undefined) return;
      if (value === "") {
        await context.secrets.delete(API_KEY_SECRET);
        vscode.window.showInformationMessage("Anthropic API key cleared.");
      } else {
        await context.secrets.store(API_KEY_SECRET, value.trim());
        vscode.window.showInformationMessage("Anthropic API key saved.");
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("reporting.newReport", async () => {
      const template = defaultReport();
      const uri = await vscode.window.showSaveDialog({
        filters: { "Report Document": ["myreport.json", "myreport"] },
        saveLabel: "Create Report",
      });
      if (!uri) return;
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(JSON.stringify(template, null, 2)));
      await vscode.commands.executeCommand("vscode.openWith", uri, "reporting.designer");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("reporting.preview", async (docUri?: vscode.Uri) => {
      const uri = docUri ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri) { vscode.window.showErrorMessage("No report open."); return; }
      const bytes = await vscode.workspace.fs.readFile(uri);
      const doc = JSON.parse(new TextDecoder().decode(bytes));
      await renderPreview(doc, context);
    }),
  );
}

export function deactivate() {}

// ---- custom editor -------------------------------------------------------

class ReportDesignerEditor implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "reporting.designer";

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      ReportDesignerEditor.viewType,
      new ReportDesignerEditor(context),
      { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: false },
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const mediaRoot = vscode.Uri.file(path.join(this.context.extensionPath, "media"));
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot],
    };

    webviewPanel.webview.html = this.renderHtml(webviewPanel.webview);

    const post = (type: string, payload?: unknown) => webviewPanel.webview.postMessage({ type, payload });

    let suppressNextLoad = false;
    let lastSentText = "";

    // sync document → webview
    const sendDoc = () => {
      const text = document.getText() || "{}";
      if (text === lastSentText) return;
      try {
        const parsed = JSON.parse(text);
        lastSentText = text;
        post("load", parsed);
      } catch (e) {
        post("error", `Invalid JSON in file: ${(e as Error).message}`);
      }
    };

    const sub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (suppressNextLoad) {
        suppressNextLoad = false;
        lastSentText = document.getText();
        return;
      }
      sendDoc();
    });
    webviewPanel.onDidDispose(() => sub.dispose());

    // webview → document
    webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case "ready": {
          const aiModel = vscode.workspace.getConfiguration("reporting").get<string>("aiModel");
          // The key never leaves the extension host: AI calls round-trip
          // through the "ai" message, so the webview only needs to know
          // whether a key is configured.
          const hasApiKey = !!(await getApiKey(this.context));
          post("config", { hasApiKey, aiModel });
          sendDoc();
          return;
        }
        case "save": {
          const next = JSON.stringify(msg.payload, null, 2);
          if (document.getText() !== next) {
            suppressNextLoad = true;
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), next);
            await vscode.workspace.applyEdit(edit);
          }
          await document.save();
          vscode.window.setStatusBarMessage("Report saved", 2000);
          return;
        }
        case "change": {
          const next = JSON.stringify(msg.payload, null, 2);
          if (document.getText() === next) return;
          suppressNextLoad = true;
          const edit = new vscode.WorkspaceEdit();
          edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), next);
          await vscode.workspace.applyEdit(edit);
          return;
        }
        case "preview":
          await renderPreview(msg.payload, this.context);
          return;
        case "ai": {
          try {
            const result = await callClaude(msg.payload, this.context);
            post("ai-result", { id: msg.id, result });
          } catch (e) {
            post("ai-result", { id: msg.id, error: (e as Error).message });
          }
          return;
        }
      }
    });
  }

  private renderHtml(webview: vscode.Webview): string {
    const mediaRoot = vscode.Uri.file(path.join(this.context.extensionPath, "media"));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "designer.js"));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "designer.css"));
    const nonce = genNonce();
    // The webview makes no direct network requests: AI and preview both
    // round-trip through the extension host via postMessage. So connect-src
    // is locked to 'none'. img-src still allows https/data so report image
    // elements preview (images are inert and cannot exfiltrate data).
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource} data:`,
      `connect-src 'none'`,
    ].join("; ");

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <link rel="stylesheet" href="${cssUri}" />
  <style> html, body, #root { height: 100%; margin: 0; } </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function genNonce(): string {
  return crypto.randomBytes(24).toString("base64");
}

async function renderPreview(doc: unknown, context: vscode.ExtensionContext) {
  const check = validateReport(doc);
  if (!check.ok) { vscode.window.showErrorMessage(`Cannot preview: ${check.error}`); return; }
  const url = vscode.workspace.getConfiguration("reporting").get<string>("pythonBackendUrl");
  if (!url) { vscode.window.showErrorMessage("Set reporting.pythonBackendUrl in settings."); return; }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(doc),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    await vscode.workspace.fs.createDirectory(context.globalStorageUri);
    const tmp = vscode.Uri.joinPath(context.globalStorageUri, `preview-${Date.now()}.pdf`);
    await vscode.workspace.fs.writeFile(tmp, buf);
    await vscode.commands.executeCommand("vscode.open", tmp);
  } catch (e) {
    vscode.window.showErrorMessage(`Preview failed: ${(e as Error).message}`);
  }
}

async function callClaude({ action, payload }: { action: string; payload: any }, context: vscode.ExtensionContext) {
  const apiKey = await getApiKey(context);
  if (!apiKey) throw new Error("No Anthropic API key set. Run “Report Designer: Set Anthropic API Key”.");
  const model = vscode.workspace.getConfiguration("reporting").get<string>("aiModel") ?? "claude-sonnet-4-6";

  const { system, user } = buildPrompt(action, payload);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 4096, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`Claude: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as any;
  const text = (json.content as any[]).map((c) => c.text ?? "").join("");
  return { action, text };
}

function buildPrompt(action: string, payload: any): { system: string; user: string } {
  const sys =
    `You are a report layout assistant. Respond with ONLY JSON (no markdown). ` +
    `Coordinates are millimetres, A4 portrait, bands: pageHeader/body/pageFooter. ` +
    `Element types: text,image,rectangle,line,barcode,table,chart,pagebreak.`;
  switch (action) {
    case "generate":
      return {
        system: sys,
        user: `Generate a ReportDocument for: "${payload.prompt}".\n\nSample data: ${JSON.stringify(payload.sampleData ?? null)}`,
      };
    case "restyle":
      return {
        system: sys,
        user: `Restyle (keep layout/bindings, change only visual props): "${payload.prompt}".\n\n${JSON.stringify(payload.doc)}`,
      };
    case "map":
      return {
        system: sys,
        user: `Propose a JSON array of ReportElement objects to visualize this data:\n${JSON.stringify(payload.sample ?? {})}`,
      };
    default:
      return { system: sys, user: JSON.stringify(payload) };
  }
}

function defaultReport() {
  return {
    schemaVersion: "1.0.0",
    meta: { title: "New Report", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    page: { size: "A4", orientation: "portrait", margin: { top: 15, right: 15, bottom: 15, left: 15 }, unit: "mm" },
    dataSources: [],
    parameters: [],
    bands: [
      { type: "pageHeader", height: 20, elements: [] },
      { type: "body", height: 200, elements: [] },
      { type: "pageFooter", height: 15, elements: [] },
    ],
  };
}
