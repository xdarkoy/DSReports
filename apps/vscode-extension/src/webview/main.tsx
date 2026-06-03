import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  ReportDesigner,
  type ReportDocument,
  createEmptyReport,
} from "@reporting/designer";
import "../../../../packages/designer/src/styles/designer.css";

declare const acquireVsCodeApi: () => {
  postMessage: (msg: any) => void;
  setState: (s: any) => void;
  getState: () => any;
};

const vscode = acquireVsCodeApi();

let pendingId = 0;
const pending = new Map<number, { resolve: (r: any) => void; reject: (e: Error) => void }>();

function safeJson(text: string) {
  const obj = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  const arr = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (obj >= 0 && objEnd >= 0 && (arr < 0 || obj < arr)) return JSON.parse(text.slice(obj, objEnd + 1));
  if (arr >= 0 && arrEnd >= 0) return JSON.parse(text.slice(arr, arrEnd + 1));
  throw new Error("AI response did not contain JSON.");
}

function makeAI() {
  const ask = <T,>(action: string, payload: any) =>
    new Promise<T>((resolve, reject) => {
      const id = ++pendingId;
      pending.set(id, {
        resolve: (raw: any) => {
          if (raw?.error) { reject(new Error(raw.error)); return; }
          const text = raw?.result?.text;
          resolve(text ? safeJson(text) as T : (raw?.result as T));
        },
        reject,
      });
      vscode.postMessage({ type: "ai", id, payload: { action, payload } });
    });

  return {
    generateReport: (prompt: string, ctx?: any) =>
      ask<ReportDocument>("generate", { prompt, sampleData: ctx?.sampleData }),
    suggestElements: async (prompt: string, ctx?: any) => {
      // No dedicated "suggest" action on the host; derive elements from a
      // generated document's body band.
      const d = await ask<ReportDocument>("generate", { prompt, sampleData: ctx?.sampleData });
      return d?.bands?.find((b) => b.type === "body")?.elements ?? [];
    },
    restyle: (prompt: string, doc: ReportDocument) =>
      ask<ReportDocument>("restyle", { prompt, doc }),
    mapData: (sample: unknown) => ask<any>("map", { sample }),
  };
}

function App() {
  const [doc, setDoc] = useState<ReportDocument>(() => createEmptyReport());
  const ai = React.useMemo(() => makeAI(), []);
  const docRef = useRef(doc);
  const lastSerialized = useRef<string>("");
  docRef.current = doc;

  // Expose the current document for a synchronous host-side pull (Visual Studio
  // WebView2 save reads this via ExecuteScriptAsync so the file is written
  // before the shell considers the save complete).
  (window as any).__rdGetDocument = () => docRef.current;

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "load") {
        const nextStr = JSON.stringify(data.payload);
        if (nextStr === lastSerialized.current) return;
        lastSerialized.current = nextStr;
        setDoc(data.payload);
      } else if (data.type === "serialize") {
        vscode.postMessage({ type: "save", payload: docRef.current });
      } else if (data.type === "ai-result") {
        const p = data.payload ?? data;
        const pendingCb = pending.get(p?.id);
        if (pendingCb) {
          pending.delete(p.id);
          pendingCb.resolve(p);
        }
      } else if (data.type === "error") {
        console.error(data.payload);
      }
    };
    window.addEventListener("message", onMsg);
    vscode.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <ReportDesigner
      document={doc}
      ai={ai}
      onDocumentChange={(d) => {
        setDoc(d);
        lastSerialized.current = JSON.stringify(d);
        vscode.postMessage({ type: "change", payload: d });
      }}
      host={{
        onSave: (d) => vscode.postMessage({ type: "save", payload: d }),
        onRequestPreview: (d) => vscode.postMessage({ type: "preview", payload: d }),
      }}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
