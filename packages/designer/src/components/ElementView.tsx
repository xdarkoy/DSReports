import { useRef } from "react";
import clsx from "clsx";
import type { BandType, ReportElement } from "@reporting/schema";
import { useDesignerStore } from "../store/designerStore";
import { renderElement } from "./renderers";
import { evaluateCondition } from "../utils/expression";
import { bindElement } from "../utils/binding";

interface Props {
  element: ReportElement;
  bandType: BandType;
  pxPerMm: number;
  data: Record<string, unknown>;
}

type DragMode =
  | null
  | { kind: "move"; startX: number; startY: number; origX: number; origY: number }
  | {
      kind: "resize";
      handle: "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
      startX: number;
      startY: number;
      orig: { x: number; y: number; width: number; height: number };
    };

export function ElementView({ element, bandType, pxPerMm, data }: Props) {
  const selection = useDesignerStore((s) => s.selection);
  const selectElement = useDesignerStore((s) => s.selectElement);
  const updateElement = useDesignerStore((s) => s.updateElement);
  const snap = useDesignerStore((s) => s.snapToGrid);
  const grid = useDesignerStore((s) => s.gridSize);
  const readOnly = useDesignerStore((s) => s.readOnly);

  const isSelected =
    selection.kind === "element" && selection.elementId === element.id && selection.bandType === bandType;
  const dragRef = useRef<DragMode>(null);

  const maybeSnap = (v: number) => (snap ? Math.round(v / grid) * grid : v);

  const onMouseDownMove = (e: React.MouseEvent) => {
    if (element.locked) return;
    e.stopPropagation();
    selectElement(bandType, element.id);
    if (readOnly) return; // selectable but not movable in read-only mode
    dragRef.current = {
      kind: "move",
      startX: e.clientX,
      startY: e.clientY,
      origX: element.bounds.x,
      origY: element.bounds.y,
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onMouseDownResize = (e: React.MouseEvent, handle: "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se") => {
    e.stopPropagation();
    dragRef.current = {
      kind: "resize",
      handle,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...element.bounds },
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onMouseMove = (e: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dxMm = (e.clientX - drag.startX) / pxPerMm;
    const dyMm = (e.clientY - drag.startY) / pxPerMm;

    if (drag.kind === "move") {
      updateElement(bandType, element.id, (el) => ({
        ...el,
        bounds: {
          ...el.bounds,
          x: Math.max(0, maybeSnap(drag.origX + dxMm)),
          y: Math.max(0, maybeSnap(drag.origY + dyMm)),
        },
      }));
    } else {
      const { handle, orig } = drag;
      let { x, y, width, height } = orig;
      if (handle.includes("e")) width = Math.max(2, maybeSnap(orig.width + dxMm));
      if (handle.includes("s")) height = Math.max(2, maybeSnap(orig.height + dyMm));
      if (handle.includes("w")) {
        const nx = maybeSnap(orig.x + dxMm);
        width = Math.max(2, orig.width - (nx - orig.x));
        x = Math.min(nx, orig.x + orig.width - 2);
      }
      if (handle.includes("n")) {
        const ny = maybeSnap(orig.y + dyMm);
        height = Math.max(2, orig.height - (ny - orig.y));
        y = Math.min(ny, orig.y + orig.height - 2);
      }
      updateElement(bandType, element.id, (el) => ({ ...el, bounds: { x, y, width, height } }));
    }
  };

  const onMouseUp = () => {
    dragRef.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  // At design time hidden elements are dimmed (not removed) so they stay
  // selectable; the PDF renderer omits them entirely. Mirrors the backend's
  // visible / visibleIf handling.
  const hidden = element.visible === false || !evaluateCondition(element.visibleIf, data);

  // Accept a data field dragged from the Data Explorer: bind it to this
  // element's primary property (text→value, image→source, table→dataSource…).
  const acceptsBinding = (e: React.DragEvent) =>
    e.dataTransfer.types.includes("application/x-rd-binding");
  const onDragOverBinding = (e: React.DragEvent) => {
    if (acceptsBinding(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; }
  };
  const onDropBinding = (e: React.DragEvent) => {
    const binding = e.dataTransfer.getData("application/x-rd-binding");
    if (!binding) return;
    e.preventDefault();
    e.stopPropagation();
    selectElement(bandType, element.id);
    updateElement(bandType, element.id, (el) => bindElement(el, binding, data));
  };

  const style: React.CSSProperties = {
    left: element.bounds.x * pxPerMm,
    top: element.bounds.y * pxPerMm,
    width: element.bounds.width * pxPerMm,
    height: element.bounds.height * pxPerMm,
    zIndex: element.zIndex ?? 1,
    opacity: hidden ? 0.35 : undefined,
  };

  return (
    <div
      className={clsx("rd-element", isSelected && "rd-selected", element.locked && "rd-locked", hidden && "rd-hidden")}
      style={style}
      onMouseDown={onMouseDownMove}
      onDragOver={onDragOverBinding}
      onDrop={onDropBinding}
      title={hidden ? "Hidden (visible=false / visibleIf)" : undefined}
    >
      {renderElement(element, data, pxPerMm)}
      {isSelected && !element.locked && !readOnly && (
        <>
          {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((h) => (
            <div
              key={h}
              className={`rd-handle rd-${h}`}
              onMouseDown={(e) => onMouseDownResize(e, h)}
            />
          ))}
        </>
      )}
    </div>
  );
}
