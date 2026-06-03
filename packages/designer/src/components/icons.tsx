import type { ElementType } from "@reporting/schema";

interface Props {
  size?: number;
  className?: string;
}

function Svg({ children, size = 18, className }: React.PropsWithChildren<Props>) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const TextIcon = (p: Props) => (
  <Svg {...p}><path d="M4 7V5h16v2" /><path d="M9 5v14" /><path d="M15 5v14" /><path d="M7 19h10" /></Svg>
);
export const ImageIcon = (p: Props) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></Svg>
);
export const RectIcon = (p: Props) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="1" /></Svg>
);
export const LineIcon = (p: Props) => (
  <Svg {...p}><path d="M4 18 20 6" /></Svg>
);
export const BarcodeIcon = (p: Props) => (
  <Svg {...p}><path d="M4 6v12M7 6v12M10 6v8M13 6v12M16 6v8M19 6v12" /></Svg>
);
export const TableIcon = (p: Props) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 10h18" /><path d="M9 4v16" /></Svg>
);
export const ChartIcon = (p: Props) => (
  <Svg {...p}><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="8" /><rect x="12" y="6" width="3" height="12" /><rect x="17" y="13" width="3" height="5" /></Svg>
);
export const PageBreakIcon = (p: Props) => (
  <Svg {...p}><path d="M4 12h3M9 12h2M13 12h2M17 12h3" /><path d="M8 4v4M16 4v4M8 16v4M16 16v4" /></Svg>
);
export const CrossTabIcon = (p: Props) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></Svg>
);
export const SubReportIcon = (p: Props) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="8" width="10" height="8" rx="1" /></Svg>
);
export const SparkleIcon = (p: Props) => (
  <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5 5l2.5 2.5M16.5 16.5 19 19M5 19l2.5-2.5M16.5 7.5 19 5" /></Svg>
);
export const SaveIcon = (p: Props) => (
  <Svg {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h8" /></Svg>
);
export const PreviewIcon = (p: Props) => (
  <Svg {...p}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></Svg>
);
export const UndoIcon = (p: Props) => (
  <Svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-4" /></Svg>
);
export const RedoIcon = (p: Props) => (
  <Svg {...p}><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h4" /></Svg>
);
export const TrashIcon = (p: Props) => (
  <Svg {...p}><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></Svg>
);
export const CopyIcon = (p: Props) => (
  <Svg {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></Svg>
);
export const GridIcon = (p: Props) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></Svg>
);
export const ZoomInIcon = (p: Props) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="M11 8v6M8 11h6" /></Svg>
);
export const ZoomOutIcon = (p: Props) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /><path d="M8 11h6" /></Svg>
);
export const DatabaseIcon = (p: Props) => (
  <Svg {...p}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5" /><path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6" /></Svg>
);

export const ELEMENT_ICONS: Record<ElementType, (p: Props) => JSX.Element> = {
  text: TextIcon,
  image: ImageIcon,
  rectangle: RectIcon,
  line: LineIcon,
  barcode: BarcodeIcon,
  table: TableIcon,
  chart: ChartIcon,
  crosstab: CrossTabIcon,
  subreport: SubReportIcon,
  pagebreak: PageBreakIcon,
};
