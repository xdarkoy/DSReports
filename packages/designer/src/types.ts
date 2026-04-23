import type { ReportDocument, ReportElement } from "@reporting/schema";

export interface AIProvider {
  /** Generate a full report document from a natural language prompt. */
  generateReport(prompt: string, context?: AIContext): Promise<ReportDocument>;
  /** Suggest element(s) to add based on intent. */
  suggestElements(prompt: string, context?: AIContext): Promise<ReportElement[]>;
  /** Restyle the current document (e.g. "use company colors blue/grey"). */
  restyle(prompt: string, doc: ReportDocument): Promise<ReportDocument>;
  /** Given a sample data object, propose element bindings. */
  mapData(sample: unknown): Promise<ReportElement[]>;
}

export interface AIContext {
  document?: ReportDocument;
  sampleData?: unknown;
}

/**
 * Bridge for host integration (VS Code webview, Visual Studio WebView2, …).
 * The designer calls these hooks; the host is responsible for persistence.
 */
export interface HostBridge {
  onSave?: (doc: ReportDocument) => void | Promise<void>;
  onChange?: (doc: ReportDocument) => void;
  onRequestPreview?: (doc: ReportDocument) => void | Promise<void>;
  /** Optional – request the host to resolve an asset (e.g. image path). */
  resolveAsset?: (path: string) => Promise<string>;
}

export interface ReportDesignerProps {
  initialDocument?: ReportDocument;
  document?: ReportDocument;
  onDocumentChange?: (doc: ReportDocument) => void;
  ai?: AIProvider;
  host?: HostBridge;
  readOnly?: boolean;
  className?: string;
  /** default sample data for design-time rendering */
  sampleData?: unknown;
  /** show/hide specific panels */
  layout?: {
    toolbox?: boolean;
    properties?: boolean;
    dataExplorer?: boolean;
    aiCopilot?: boolean;
    topbar?: boolean;
  };
}
