import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useDesignerStore } from "./store/designerStore";
import type { ReportDesignerProps } from "./types";
import { TopBar } from "./components/TopBar";
import { Toolbox } from "./components/Toolbox";
import { Canvas } from "./components/Canvas";
import { PropertyGrid } from "./components/PropertyGrid";
import { DataExplorer } from "./components/DataExplorer";
import { AICopilot } from "./components/AICopilot";
import { createEmptyReport } from "@xdarkoy/schema";

export function ReportDesigner(props: ReportDesignerProps) {
  const {
    initialDocument,
    document,
    onDocumentChange,
    ai,
    host,
    readOnly = false,
    className,
    sampleData,
    layout,
  } = props;

  const replaceDocument = useDesignerStore((s) => s.replaceDocument);
  const setSampleData = useDesignerStore((s) => s.setSampleData);
  const setReadOnly = useDesignerStore((s) => s.setReadOnly);
  const doc = useDesignerStore((s) => s.doc);

  useEffect(() => { setReadOnly(readOnly); }, [readOnly, setReadOnly]);

  // Hold the latest callbacks in refs so the "push changes" effect depends
  // only on `doc` — otherwise inline `host`/`onDocumentChange` objects (new
  // identity every parent render) would fire the effect on every render.
  const onChangeRef = useRef(onDocumentChange);
  const hostRef = useRef(host);
  onChangeRef.current = onDocumentChange;
  hostRef.current = host;

  // Tracks the last document we emitted (or loaded) so we can tell our own
  // echo apart from a genuine external update — prevents the
  // change→onChange→prop→replaceDocument→change feedback loop and stops the
  // controlled sync from wiping undo history on every keystroke.
  const lastSynced = useRef<string>("");

  // init
  useEffect(() => {
    const initial = document ?? initialDocument ?? createEmptyReport();
    lastSynced.current = JSON.stringify(initial);
    replaceDocument(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // controlled mode: sync only on a genuine external `document` change
  useEffect(() => {
    if (!document) return;
    const s = JSON.stringify(document);
    if (s === lastSynced.current) return; // our own echo — ignore
    lastSynced.current = s;
    replaceDocument(document);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document]);

  // push changes back to parent (only when the document actually changes)
  useEffect(() => {
    const s = JSON.stringify(doc);
    if (s === lastSynced.current) return;
    lastSynced.current = s;
    onChangeRef.current?.(doc);
    hostRef.current?.onChange?.(doc);
  }, [doc]);

  useEffect(() => {
    if (sampleData !== undefined) setSampleData(sampleData);
  }, [sampleData, setSampleData]);

  const [leftTab, setLeftTab] = useState<"toolbox" | "data">("toolbox");
  const [rightTab, setRightTab] = useState<"props" | "ai">("props");

  const showToolbox = layout?.toolbox !== false;
  const showProps = layout?.properties !== false;
  const showData = layout?.dataExplorer !== false;
  const showAI = layout?.aiCopilot !== false;
  const showTop = layout?.topbar !== false;

  return (
    <div className={clsx("rd-root", className)} data-readonly={readOnly || undefined}>
      {showTop && <TopBar host={host} />}
      <div className="rd-workspace">
        {(showToolbox || showData) && (
          <aside className="rd-panel">
            <div className="rd-tabs">
              {showToolbox && (
                <button className={clsx("rd-tab", leftTab === "toolbox" && "rd-active")} onClick={() => setLeftTab("toolbox")}>
                  Toolbox
                </button>
              )}
              {showData && (
                <button className={clsx("rd-tab", leftTab === "data" && "rd-active")} onClick={() => setLeftTab("data")}>
                  Data
                </button>
              )}
            </div>
            {leftTab === "toolbox" && showToolbox ? <Toolbox /> : showData ? <DataExplorer /> : null}
          </aside>
        )}

        <Canvas />

        {(showProps || showAI) && (
          <aside className="rd-panel rd-right">
            <div className="rd-tabs">
              {showProps && (
                <button className={clsx("rd-tab", rightTab === "props" && "rd-active")} onClick={() => setRightTab("props")}>
                  Properties
                </button>
              )}
              {showAI && (
                <button className={clsx("rd-tab", rightTab === "ai" && "rd-active")} onClick={() => setRightTab("ai")}>
                  ✨ AI
                </button>
              )}
            </div>
            {rightTab === "props" && showProps ? <PropertyGrid /> : showAI ? <AICopilot ai={ai} /> : null}
          </aside>
        )}
      </div>
    </div>
  );
}
