import { useDesignerStore } from "../store/designerStore";
import type { HostBridge } from "../types";
import {
  CopyIcon, GridIcon, PreviewIcon, RedoIcon, SaveIcon, TrashIcon, UndoIcon, ZoomInIcon, ZoomOutIcon,
} from "./icons";

interface Props {
  host?: HostBridge;
}

export function TopBar({ host }: Props) {
  const doc = useDesignerStore((s) => s.doc);
  const zoom = useDesignerStore((s) => s.zoom);
  const setZoom = useDesignerStore((s) => s.setZoom);
  const showGrid = useDesignerStore((s) => s.showGrid);
  const setShowGrid = useDesignerStore((s) => s.setShowGrid);
  const snap = useDesignerStore((s) => s.snapToGrid);
  const setSnap = useDesignerStore((s) => s.setSnap);
  const undo = useDesignerStore((s) => s.undo);
  const redo = useDesignerStore((s) => s.redo);
  const canUndo = useDesignerStore((s) => s.canUndo());
  const canRedo = useDesignerStore((s) => s.canRedo());
  const selection = useDesignerStore((s) => s.selection);
  const duplicate = useDesignerStore((s) => s.duplicateSelection);
  const deleteElement = useDesignerStore((s) => s.deleteElement);

  const hasSelection = selection.kind === "element";

  return (
    <div className="rd-topbar">
      <span className="rd-title">📐 {doc.meta.title}</span>

      <button className="rd-btn rd-icon" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><UndoIcon size={15} /></button>
      <button className="rd-btn rd-icon" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}><RedoIcon size={15} /></button>

      <Divider />

      <button className="rd-btn rd-icon" title="Duplicate (Ctrl+D)" disabled={!hasSelection} onClick={duplicate}><CopyIcon size={15} /></button>
      <button
        className="rd-btn rd-icon"
        title="Delete (Del)"
        disabled={!hasSelection}
        onClick={() => selection.kind === "element" && deleteElement(selection.bandType, selection.elementId)}
      ><TrashIcon size={15} /></button>

      <Divider />

      <button
        className={`rd-btn rd-icon ${showGrid ? "rd-btn-primary" : ""}`}
        title="Toggle grid"
        onClick={() => setShowGrid(!showGrid)}
      ><GridIcon size={15} /></button>
      <label className="rd-btn" title="Snap to grid" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} style={{ marginRight: 6 }} />
        Snap
      </label>

      <Divider />

      <button className="rd-btn rd-icon" title="Zoom out" onClick={() => setZoom(zoom - 0.1)}><ZoomOutIcon size={15} /></button>
      <span style={{ minWidth: 48, textAlign: "center", color: "var(--rd-muted)" }}>{Math.round(zoom * 100)}%</span>
      <button className="rd-btn rd-icon" title="Zoom in" onClick={() => setZoom(zoom + 0.1)}><ZoomInIcon size={15} /></button>

      <div className="rd-spacer" />

      {host?.onRequestPreview && (
        <button className="rd-btn" onClick={() => host.onRequestPreview?.(doc)}>
          <PreviewIcon size={15} /> Preview
        </button>
      )}
      {host?.onSave && (
        <button className="rd-btn rd-btn-primary" onClick={() => host.onSave?.(doc)}>
          <SaveIcon size={15} /> Save
        </button>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 20, background: "var(--rd-border)", margin: "0 4px" }} />;
}
