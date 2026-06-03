import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  mmToPx,
  paperSizeMm,
  resolveParameters,
  type Band,
  type BandType,
  type ElementType,
  type ReportElement,
} from "@xdarkoy/schema";
import { useDesignerStore } from "../store/designerStore";
import { ElementView } from "./ElementView";
import { evaluateArray, resolveBinding } from "../utils/expression";
import { columnsFromData } from "../utils/binding";
import { systemFields } from "../utils/reportFields";
import { groupRows } from "../utils/tableData";

const BAND_LABELS: Record<BandType, string> = {
  pageHeader: "Page Header",
  reportHeader: "Report Header",
  groupHeader: "Group Header",
  body: "Body",
  groupFooter: "Group Footer",
  reportFooter: "Report Footer",
  pageFooter: "Page Footer",
};

export function Canvas() {
  const doc = useDesignerStore((s) => s.doc);
  const zoom = useDesignerStore((s) => s.zoom);
  const selection = useDesignerStore((s) => s.selection);
  const showGrid = useDesignerStore((s) => s.showGrid);
  const gridSize = useDesignerStore((s) => s.gridSize);
  const snap = useDesignerStore((s) => s.snapToGrid);
  const sampleData = useDesignerStore((s) => s.sampleData);
  const readOnly = useDesignerStore((s) => s.readOnly);
  const select = useDesignerStore((s) => s.select);
  const addElementAt = useDesignerStore((s) => s.addElementAt);
  const updateElement = useDesignerStore((s) => s.updateElement);

  const size = paperSizeMm(doc.page.size, doc.page.orientation);
  const pxPerMm = mmToPx(1) * zoom;
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [dragOverBand, setDragOverBand] = useState<BandType | null>(null);

  const dataCtx = useMemo<Record<string, unknown>>(() => {
    const base = sampleData && typeof sampleData === "object" ? (sampleData as Record<string, unknown>) : {};
    const ctx: Record<string, unknown> = {
      ...base,
      params: resolveParameters(doc.parameters),
      ...systemFields({ title: doc.meta.title }),
    };
    // When the report is grouped, preview shows the FIRST group's context so
    // {{group}}/{{groupItems}} resolve in the group bands.
    if (doc.grouping?.field) {
      const master = resolveBinding(doc.grouping.dataSource, ctx);
      if (Array.isArray(master) && master.length) {
        const first = groupRows(master, doc.grouping.field)[0];
        ctx.group = first.key;
        ctx.groupItems = first.rows;
        ctx.GroupCount = first.rows.length;
      }
    }
    return ctx;
  }, [sampleData, doc.meta.title, doc.parameters, doc.grouping]);

  const handleDrop = (e: React.DragEvent, band: Band) => {
    e.preventDefault();
    setDragOverBand(null);
    if (readOnly) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const xMm = (e.clientX - rect.left) / pxPerMm;
    const yMm = (e.clientY - rect.top) / pxPerMm;
    const [x, y] = maybeSnap(xMm, yMm, snap, gridSize);
    const px = Math.max(0, x);
    const py = Math.max(0, y);

    const type = e.dataTransfer.getData("application/x-rd-element") as ElementType | "";
    if (type) {
      addElementAt(band.type, type, px, py);
      return;
    }

    // A data field dragged from the Data Explorer onto empty band space:
    // create a table if it resolves to an array of objects, else a text field.
    const binding = e.dataTransfer.getData("application/x-rd-binding");
    if (binding) {
      const cols = columnsFromData(binding, dataCtx);
      if (cols.length) {
        const el = addElementAt(band.type, "table", px, py);
        updateElement(band.type, el.id, (prev) =>
          prev.type === "table" ? { ...prev, dataSource: binding, columns: cols } : prev,
        );
      } else {
        const el = addElementAt(band.type, "text", px, py);
        updateElement(band.type, el.id, (prev) =>
          prev.type === "text" ? { ...prev, value: binding } : prev,
        );
      }
    }
  };

  // Keyboard shortcuts on selected element
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selection.kind !== "element" || useDesignerStore.getState().readOnly) return;
      const target = e.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;

      const step = e.shiftKey ? gridSize : 1;
      const { bandType, elementId } = selection;
      const move = (dx: number, dy: number) => {
        e.preventDefault();
        updateElement(bandType, elementId, (el) => ({
          ...el,
          bounds: { ...el.bounds, x: Math.max(0, el.bounds.x + dx), y: Math.max(0, el.bounds.y + dy) },
        }));
      };
      if (e.key === "ArrowLeft") move(-step, 0);
      else if (e.key === "ArrowRight") move(step, 0);
      else if (e.key === "ArrowUp") move(0, -step);
      else if (e.key === "ArrowDown") move(0, step);
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        useDesignerStore.getState().deleteElement(bandType, elementId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        useDesignerStore.getState().duplicateSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        useDesignerStore.getState().undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        useDesignerStore.getState().redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, gridSize, updateElement]);

  const paperStyle: React.CSSProperties = {
    width: size.width * pxPerMm,
    height: size.height * pxPerMm,
  };

  return (
    <div
      className="rd-canvas-area rd-scroll"
      onClick={(e) => {
        if (e.target === e.currentTarget) select({ kind: "none" });
      }}
    >
      <div className="rd-paper" ref={paperRef} style={paperStyle}>
        {showGrid && <GridOverlay pxPerMm={pxPerMm} gridSize={gridSize} />}
        {doc.bands.map((band) => (
          <BandView
            key={band.type}
            band={band}
            pxPerMm={pxPerMm}
            dataCtx={dataCtx}
            isDragOver={dragOverBand === band.type}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setDragOverBand(band.type);
            }}
            onDragLeave={() => setDragOverBand(null)}
            onDrop={(e) => handleDrop(e, band)}
          />
        ))}
      </div>
    </div>
  );
}

function BandView({
  band,
  pxPerMm,
  dataCtx,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  band: Band;
  pxPerMm: number;
  dataCtx: Record<string, unknown>;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const select = useDesignerStore((s) => s.select);
  return (
    <div
      className={clsx("rd-band", isDragOver && "rd-drag-over")}
      style={{ height: band.height * pxPerMm }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) select({ kind: "band", bandType: band.type });
      }}
    >
      <span className="rd-band-label">{BAND_LABELS[band.type]}</span>
      {band.elements.map((el) => (
        <ElementView key={el.id} element={el} bandType={band.type} pxPerMm={pxPerMm} data={dataCtx} />
      ))}
    </div>
  );
}

function GridOverlay({ pxPerMm, gridSize }: { pxPerMm: number; gridSize: number }) {
  const step = gridSize * pxPerMm;
  const bg = `repeating-linear-gradient(0deg, transparent 0, transparent ${step - 1}px, rgba(17,24,39,0.06) ${step}px), repeating-linear-gradient(90deg, transparent 0, transparent ${step - 1}px, rgba(17,24,39,0.06) ${step}px)`;
  return <div className="rd-grid" style={{ backgroundImage: bg }} />;
}

function maybeSnap(x: number, y: number, snap: boolean, grid: number): [number, number] {
  if (!snap) return [x, y];
  return [Math.round(x / grid) * grid, Math.round(y / grid) * grid];
}

export { maybeSnap };
