import { create } from "zustand";
import { nanoid } from "nanoid";
import {
  createEmptyReport,
  type Band,
  type BandType,
  type DataSource,
  type ElementType,
  type ReportDocument,
  type ReportElement,
} from "@reporting/schema";

export type Selection =
  | { kind: "none" }
  | { kind: "element"; bandType: BandType; elementId: string }
  | { kind: "band"; bandType: BandType };

interface HistoryEntry {
  doc: ReportDocument;
  selection: Selection;
}

interface DesignerState {
  doc: ReportDocument;
  selection: Selection;
  zoom: number;
  gridSize: number; // mm
  snapToGrid: boolean;
  showGrid: boolean;
  sampleData: unknown;
  history: HistoryEntry[];
  future: HistoryEntry[];
  lastEditAt: number;

  // ---- setters
  setDocument: (doc: ReportDocument, record?: boolean) => void;
  replaceDocument: (doc: ReportDocument) => void;
  setZoom: (zoom: number) => void;
  setSnap: (snap: boolean) => void;
  setShowGrid: (show: boolean) => void;
  setGridSize: (size: number) => void;
  setSampleData: (data: unknown) => void;

  // ---- selection
  select: (sel: Selection) => void;
  selectElement: (bandType: BandType, elementId: string) => void;
  clearSelection: () => void;

  // ---- elements
  addElement: (bandType: BandType, el: ReportElement) => void;
  addElementAt: (bandType: BandType, type: ElementType, x: number, y: number) => ReportElement;
  updateElement: (
    bandType: BandType,
    elementId: string,
    updater: (el: ReportElement) => ReportElement,
  ) => void;
  deleteElement: (bandType: BandType, elementId: string) => void;
  duplicateSelection: () => void;
  moveSelectionBy: (dx: number, dy: number) => void;

  // ---- bands
  updateBand: (bandType: BandType, updater: (band: Band) => Band) => void;

  // ---- data sources
  addDataSource: (ds: DataSource) => void;
  removeDataSource: (id: string) => void;
  updateDataSource: (id: string, updater: (ds: DataSource) => DataSource) => void;

  // ---- history
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function stamp(doc: ReportDocument): ReportDocument {
  return { ...doc, meta: { ...doc.meta, updatedAt: new Date().toISOString() } };
}

function elementFactory(type: ElementType, x: number, y: number): ReportElement {
  const id = nanoid(8);
  const base = { id, bounds: { x, y, width: 60, height: 10 } };
  switch (type) {
    case "text":
      return {
        ...base,
        type: "text",
        value: "Text",
        style: { fontSize: 10, color: "#111827" },
      };
    case "image":
      return { ...base, type: "image", source: "", fit: "contain", bounds: { x, y, width: 40, height: 40 } };
    case "rectangle":
      return {
        ...base,
        type: "rectangle",
        bounds: { x, y, width: 60, height: 30 },
        style: { borderColor: "#111827", borderWidth: 0.3, borderStyle: "solid" },
      };
    case "line":
      return { ...base, type: "line", bounds: { x, y, width: 60, height: 0.3 }, color: "#111827", width: 0.3, direction: "horizontal" };
    case "barcode":
      return { ...base, type: "barcode", value: "123456789", symbology: "code128", showText: true, bounds: { x, y, width: 50, height: 15 } };
    case "table":
      return {
        ...base,
        type: "table",
        bounds: { x, y, width: 170, height: 40 },
        dataSource: "{{items}}",
        headerHeight: 8,
        rowHeight: 7,
        showHeader: true,
        columns: [
          { id: nanoid(6), header: "Description", cell: "{{row.description}}", width: 100 },
          { id: nanoid(6), header: "Qty", cell: "{{row.qty}}", width: 20 },
          { id: nanoid(6), header: "Price", cell: "{{row.price}}", width: 25, format: "{0:C}" },
          { id: nanoid(6), header: "Total", cell: "= row.qty * row.price", width: 25, format: "{0:C}" },
        ],
      };
    case "chart":
      return {
        ...base,
        type: "chart",
        bounds: { x, y, width: 100, height: 60 },
        kind: "bar",
        dataSource: "{{items}}",
        categoryField: "label",
        valueField: "value",
        showLegend: true,
      };
    case "pagebreak":
      return { ...base, type: "pagebreak", bounds: { x: 0, y, width: 210, height: 0.1 } };
    case "crosstab":
      return {
        ...base,
        type: "crosstab",
        bounds: { x, y, width: 150, height: 50 },
        dataSource: "{{items}}",
        rowField: "category",
        columnField: "month",
        valueField: "amount",
        aggregate: "sum",
        showRowTotals: true,
        showColumnTotals: true,
        format: "{0:N2}",
      };
    case "subreport": {
      const nested = createEmptyReport("Sub-Report");
      const body = nested.bands.find((b) => b.type === "body");
      if (body) {
        body.elements.push({
          id: nanoid(8), type: "text",
          bounds: { x: 2, y: 2, width: 100, height: 8 },
          value: "Sub-Report", style: { fontSize: 10, color: "#6b7280" },
        } as ReportElement);
      }
      return { ...base, type: "subreport", bounds: { x, y, width: 120, height: 40 }, dataSource: "", document: nested };
    }
  }
}

const MAX_HISTORY = 100;
// Rapid successive edits (a drag's many mousemoves, typing in a field) are
// merged into a single undo step when they land within this window.
const COALESCE_MS = 400;

export const useDesignerStore = create<DesignerState>((set, get) => ({
  doc: createEmptyReport(),
  selection: { kind: "none" },
  zoom: 1,
  gridSize: 5,
  snapToGrid: true,
  showGrid: true,
  sampleData: undefined,
  history: [],
  future: [],
  lastEditAt: 0,

  setDocument: (doc, record = true) => {
    const prev = get();
    if (!record) {
      set({ doc: stamp(doc) });
      return;
    }
    const now = Date.now();
    // Coalesce with the previous edit if it was very recent: replace the
    // current doc without pushing another history entry, so one drag / one
    // burst of typing is a single undo step.
    const coalesce = prev.history.length > 0 && now - prev.lastEditAt < COALESCE_MS;
    if (coalesce) {
      set({ doc: stamp(doc), future: [], lastEditAt: now });
      return;
    }
    const hist = [...prev.history, { doc: prev.doc, selection: prev.selection }];
    if (hist.length > MAX_HISTORY) hist.shift();
    set({ doc: stamp(doc), history: hist, future: [], lastEditAt: now });
  },

  replaceDocument: (doc) =>
    set({ doc: stamp(doc), selection: { kind: "none" }, history: [], future: [], lastEditAt: 0 }),

  setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(4, zoom)) }),
  setSnap: (snap) => set({ snapToGrid: snap }),
  setShowGrid: (show) => set({ showGrid: show }),
  setGridSize: (size) => set({ gridSize: Math.max(1, size) }),
  setSampleData: (data) => set({ sampleData: data }),

  select: (sel) => set({ selection: sel }),
  selectElement: (bandType, elementId) => set({ selection: { kind: "element", bandType, elementId } }),
  clearSelection: () => set({ selection: { kind: "none" } }),

  addElement: (bandType, el) => {
    const { doc, setDocument } = get();
    const bands = doc.bands.map((b) =>
      b.type === bandType ? { ...b, elements: [...b.elements, el] } : b,
    );
    setDocument({ ...doc, bands });
    set({ selection: { kind: "element", bandType, elementId: el.id } });
  },

  addElementAt: (bandType, type, x, y) => {
    const el = elementFactory(type, x, y);
    get().addElement(bandType, el);
    return el;
  },

  updateElement: (bandType, elementId, updater) => {
    const { doc, setDocument } = get();
    const bands = doc.bands.map((b) => {
      if (b.type !== bandType) return b;
      return {
        ...b,
        elements: b.elements.map((el) => (el.id === elementId ? updater(el) : el)),
      };
    });
    setDocument({ ...doc, bands });
  },

  deleteElement: (bandType, elementId) => {
    const { doc, setDocument } = get();
    const bands = doc.bands.map((b) =>
      b.type === bandType ? { ...b, elements: b.elements.filter((e) => e.id !== elementId) } : b,
    );
    setDocument({ ...doc, bands });
    set({ selection: { kind: "none" } });
  },

  duplicateSelection: () => {
    const { selection, doc } = get();
    if (selection.kind !== "element") return;
    const band = doc.bands.find((b) => b.type === selection.bandType);
    const el = band?.elements.find((e) => e.id === selection.elementId);
    if (!el) return;
    const clone: ReportElement = {
      ...el,
      id: nanoid(8),
      bounds: { ...el.bounds, x: el.bounds.x + 5, y: el.bounds.y + 5 },
    } as ReportElement;
    get().addElement(selection.bandType, clone);
  },

  moveSelectionBy: (dx, dy) => {
    const { selection } = get();
    if (selection.kind !== "element") return;
    get().updateElement(selection.bandType, selection.elementId, (el) => ({
      ...el,
      bounds: { ...el.bounds, x: el.bounds.x + dx, y: el.bounds.y + dy },
    }));
  },

  updateBand: (bandType, updater) => {
    const { doc, setDocument } = get();
    const bands = doc.bands.map((b) => (b.type === bandType ? updater(b) : b));
    setDocument({ ...doc, bands });
  },

  addDataSource: (ds) => {
    const { doc, setDocument } = get();
    setDocument({ ...doc, dataSources: [...doc.dataSources, ds] });
  },

  removeDataSource: (id) => {
    const { doc, setDocument } = get();
    setDocument({ ...doc, dataSources: doc.dataSources.filter((d) => d.id !== id) });
  },

  updateDataSource: (id, updater) => {
    const { doc, setDocument } = get();
    setDocument({
      ...doc,
      dataSources: doc.dataSources.map((d) => (d.id === id ? updater(d) : d)),
    });
  },

  undo: () => {
    const { history, future, doc, selection } = get();
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    set({
      doc: prev.doc,
      selection: prev.selection,
      history: history.slice(0, -1),
      future: [...future, { doc, selection }],
      lastEditAt: 0,
    });
  },

  redo: () => {
    const { history, future, doc, selection } = get();
    if (future.length === 0) return;
    const next = future[future.length - 1];
    set({
      doc: next.doc,
      selection: next.selection,
      future: future.slice(0, -1),
      history: [...history, { doc, selection }],
      lastEditAt: 0,
    });
  },

  canUndo: () => get().history.length > 0,
  canRedo: () => get().future.length > 0,
}));
