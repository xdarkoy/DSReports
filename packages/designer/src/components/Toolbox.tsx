import type { ElementType } from "@xdarkoy/schema";
import { ELEMENT_ICONS } from "./icons";

const BASIC: { type: ElementType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
  { type: "rectangle", label: "Rectangle" },
  { type: "line", label: "Line" },
  { type: "pagebreak", label: "Page Break" },
];

const DATA: { type: ElementType; label: string }[] = [
  { type: "table", label: "Table" },
  { type: "chart", label: "Chart" },
  { type: "crosstab", label: "Cross-Tab" },
  { type: "subreport", label: "Sub-Report" },
  { type: "barcode", label: "Barcode" },
];

export function Toolbox() {
  const startDrag = (e: React.DragEvent, type: ElementType) => {
    e.dataTransfer.setData("application/x-rd-element", type);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="rd-panel-body rd-scroll">
      <Section title="Basic">
        <div className="rd-toolbox-grid">
          {BASIC.map((t) => {
            const Icon = ELEMENT_ICONS[t.type];
            return (
              <div
                key={t.type}
                className="rd-tool"
                draggable
                onDragStart={(e) => startDrag(e, t.type)}
                title={`Drag to add ${t.label}`}
              >
                <Icon />
                <span>{t.label}</span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Data">
        <div className="rd-toolbox-grid">
          {DATA.map((t) => {
            const Icon = ELEMENT_ICONS[t.type];
            return (
              <div
                key={t.type}
                className="rd-tool"
                draggable
                onDragStart={(e) => startDrag(e, t.type)}
              >
                <Icon />
                <span>{t.label}</span>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <div className="rd-toolbox-section">
      <div className="rd-toolbox-section-title">{title}</div>
      {children}
    </div>
  );
}
