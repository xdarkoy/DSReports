/**
 * @reporting/schema
 *
 * Das "moderne RDLC". Ein Report-Dokument ist eine deklarative JSON-Struktur,
 * die sowohl vom Designer (Frontend) erzeugt/gelesen, als auch von der
 * Render-Engine (Python-Backend) konsumiert wird.
 */

export const SCHEMA_VERSION = "1.0.0" as const;

export type PaperSize =
  | "A4"
  | "A5"
  | "A3"
  | "Letter"
  | "Legal"
  | { width: number; height: number };

export type Orientation = "portrait" | "landscape";

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageSettings {
  size: PaperSize;
  orientation: Orientation;
  margin: Margin;
  /** mm as default unit */
  unit: "mm" | "in" | "px";
}

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Bounds extends Position, Size {}

export type HorizontalAlign = "left" | "center" | "right" | "justify";
export type VerticalAlign = "top" | "middle" | "bottom";

export interface TextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold" | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  fontStyle?: "normal" | "italic";
  color?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textDecoration?: "none" | "underline" | "line-through";
  horizontalAlign?: HorizontalAlign;
  verticalAlign?: VerticalAlign;
}

export interface BoxStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: "solid" | "dashed" | "dotted" | "none";
  borderRadius?: number;
  padding?: number | Margin;
  opacity?: number;
}

/**
 * Value expressions. Either a literal string ("Hello")
 * or a data binding using handlebars-style syntax: "{{Invoice.CustomerName}}"
 * or a JS-lite expression: "= Invoice.Total * 1.19"
 */
export type ValueExpr = string;

export interface BaseElement {
  id: string;
  name?: string;
  bounds: Bounds;
  visible?: boolean;
  /** conditional visibility, e.g. "= Order.Total > 0" */
  visibleIf?: ValueExpr;
  zIndex?: number;
  locked?: boolean;
}

/**
 * Conditional formatting rule (Crystal Reports "Highlighting Expert"): when
 * `when` evaluates truthy, `style` is merged over the base style. Later rules
 * win, so order matters.
 */
export interface ConditionalFormat {
  when: ValueExpr;
  style: TextStyle & BoxStyle;
}

export interface TextElement extends BaseElement {
  type: "text";
  value: ValueExpr;
  style?: TextStyle & BoxStyle;
  /** format string e.g. "{0:C}", "yyyy-MM-dd" */
  format?: string;
  /** shrink font to fit */
  autoShrink?: boolean;
  wrap?: boolean;
  /** conditional formatting rules applied over `style` */
  conditional?: ConditionalFormat[];
}

export interface ImageElement extends BaseElement {
  type: "image";
  /** URL, data URI, or binding "{{Company.Logo}}" */
  source: ValueExpr;
  fit?: "contain" | "cover" | "fill" | "none";
  style?: BoxStyle;
}

export interface RectangleElement extends BaseElement {
  type: "rectangle";
  style?: BoxStyle;
}

export interface LineElement extends BaseElement {
  type: "line";
  color?: string;
  width?: number;
  style?: "solid" | "dashed" | "dotted";
  direction?: "horizontal" | "vertical" | "diagonal";
}

export interface BarcodeElement extends BaseElement {
  type: "barcode";
  value: ValueExpr;
  symbology:
    | "code128"
    | "code39"
    | "ean13"
    | "ean8"
    | "qrcode"
    | "datamatrix"
    | "pdf417";
  showText?: boolean;
  style?: BoxStyle;
}

/**
 * Aggregate function for a table summary/footer cell – modelled on Crystal
 * Reports' summary fields.
 */
export type SummaryFunc = "sum" | "avg" | "count" | "min" | "max";

export interface TableColumn {
  id: string;
  header: ValueExpr;
  /** binding for the cell in each row, e.g. "{{row.Price}}" */
  cell: ValueExpr;
  width: number;
  format?: string;
  headerStyle?: TextStyle & BoxStyle;
  cellStyle?: TextStyle & BoxStyle;
  /** aggregate shown in the footer/summary row for this column */
  summary?: SummaryFunc;
  /** literal/expression for the footer cell when no `summary` is set (e.g. "Gesamt:") */
  footer?: ValueExpr;
  /** show a running (cumulative) total of this column's numeric value */
  runningTotal?: boolean;
  /** conditional formatting rules applied over `cellStyle` per row */
  conditional?: ConditionalFormat[];
}

/** Sort spec for table rows (Crystal-style record sorting). */
export interface TableSort {
  field: string;
  dir?: "asc" | "desc";
}

export interface TableElement extends BaseElement {
  type: "table";
  /** data binding for the table rows: "{{Order.Items}}" */
  dataSource: ValueExpr;
  columns: TableColumn[];
  rowHeight?: number;
  headerHeight?: number;
  alternateRowColor?: string;
  showHeader?: boolean;
  /** show a summary/footer row (totals); see TableColumn.summary / footer */
  showFooter?: boolean;
  footerHeight?: number;
  /** keep only rows where this condition is truthy, e.g. "= row.qty > 0" */
  filter?: ValueExpr;
  /** sort rows before rendering (Crystal-style record sort) */
  sort?: TableSort[];
  pageBreak?: boolean;
  style?: BoxStyle;
}

export type ChartKind =
  | "bar"
  | "column"
  | "line"
  | "area"
  | "pie"
  | "doughnut"
  | "scatter";

export interface ChartElement extends BaseElement {
  type: "chart";
  kind: ChartKind;
  dataSource: ValueExpr;
  categoryField: string;
  valueField: string;
  seriesField?: string;
  title?: string;
  showLegend?: boolean;
  palette?: string[];
  style?: BoxStyle;
}

export interface PageBreakElement extends BaseElement {
  type: "pagebreak";
}

export type ReportElement =
  | TextElement
  | ImageElement
  | RectangleElement
  | LineElement
  | BarcodeElement
  | TableElement
  | ChartElement
  | PageBreakElement;

export type ElementType = ReportElement["type"];

/**
 * Band-based composition: header / footer repeat on every page,
 * body is the main flowing area.
 */
export type BandType =
  | "pageHeader"
  | "reportHeader"
  | "body"
  | "reportFooter"
  | "pageFooter";

export interface Band {
  type: BandType;
  height: number;
  elements: ReportElement[];
}

export interface DataField {
  name: string;
  type: "string" | "number" | "boolean" | "date" | "object" | "array";
  /** nested fields for object/array types */
  fields?: DataField[];
  sample?: unknown;
}

export type DataSourceKind = "json" | "rest" | "odata" | "sql" | "graphql";

export interface DataSource {
  id: string;
  name: string;
  kind: DataSourceKind;
  /** sample data used for design-time preview */
  sample?: unknown;
  /** schema description for the data explorer tree */
  schema?: DataField[];
  /** connection configuration (URL, headers, query…) */
  connection?: Record<string, unknown>;
}

export interface Parameter {
  id: string;
  name: string;
  type: "string" | "number" | "boolean" | "date";
  defaultValue?: unknown;
  prompt?: string;
  required?: boolean;
}

export interface ReportMeta {
  title: string;
  description?: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  /** arbitrary user-defined metadata */
  custom?: Record<string, unknown>;
}

/**
 * Top-level report document.
 */
export interface ReportDocument {
  schemaVersion: typeof SCHEMA_VERSION;
  meta: ReportMeta;
  page: PageSettings;
  dataSources: DataSource[];
  parameters: Parameter[];
  bands: Band[];
}

// ---------------------------------------------------------------------------
// Helpers / factories
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE: PageSettings = {
  size: "A4",
  orientation: "portrait",
  margin: { top: 15, right: 15, bottom: 15, left: 15 },
  unit: "mm",
};

export function createEmptyReport(title = "Untitled report"): ReportDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title, createdAt: now, updatedAt: now },
    page: { ...DEFAULT_PAGE },
    dataSources: [],
    parameters: [],
    bands: [
      { type: "pageHeader", height: 20, elements: [] },
      { type: "body", height: 200, elements: [] },
      { type: "pageFooter", height: 15, elements: [] },
    ],
  };
}

/** Size of a sheet in millimetres. */
export function paperSizeMm(size: PaperSize, orientation: Orientation = "portrait"): Size {
  const landscape = (w: number, h: number) =>
    orientation === "landscape" ? { width: h, height: w } : { width: w, height: h };
  if (typeof size === "object") return landscape(size.width, size.height);
  switch (size) {
    case "A3":
      return landscape(297, 420);
    case "A4":
      return landscape(210, 297);
    case "A5":
      return landscape(148, 210);
    case "Letter":
      return landscape(215.9, 279.4);
    case "Legal":
      return landscape(215.9, 355.6);
  }
}

export function mmToPx(mm: number, dpi = 96): number {
  return (mm / 25.4) * dpi;
}

export function pxToMm(px: number, dpi = 96): number {
  return (px * 25.4) / dpi;
}

export function isBindingExpression(value: string): boolean {
  return /\{\{[^}]+\}\}/.test(value) || value.startsWith("=");
}

/** Tiny runtime validator. Keeps parity with the JSON Schema shape. */
export function validateReport(doc: unknown): { ok: true } | { ok: false; error: string } {
  if (!doc || typeof doc !== "object") return { ok: false, error: "document must be an object" };
  const d = doc as Partial<ReportDocument>;
  if (d.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, error: `unsupported schemaVersion ${d.schemaVersion}` };
  }
  if (!d.page) return { ok: false, error: "page is required" };
  if (!Array.isArray(d.bands)) return { ok: false, error: "bands must be an array" };
  return { ok: true };
}
