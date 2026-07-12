import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { WIDGET_REGISTRY } from "./widgets";
import { WidgetSettings } from "./WidgetSettings";
import type { WidgetInstance } from "../../lib/services/dashboard";
import type { DashboardData } from "../../lib/services/dashboard";
import "./WidgetCard.css";

interface WidgetCardProps {
  widget: WidgetInstance;
  data: DashboardData;
  editMode: boolean;
  onRemove: (id: string) => void;
  onUpdateConfig: (
    id: string,
    config: Record<string, string | boolean>,
  ) => void;
}

export function WidgetCard({
  widget,
  data,
  editMode,
  onRemove,
  onUpdateConfig,
}: WidgetCardProps) {
  const [showSettings, setShowSettings] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id, disabled: !editMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${widget.position.w}`,
    gridRow: `span ${widget.position.h}`,
  };

  const entry = WIDGET_REGISTRY[widget.type];
  if (!entry) return null;

  const WidgetComponent = entry.component;
  const hasSettings =
    entry.definition.configurable && entry.definition.configurable.length > 0;

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`widget-card card${isDragging ? " widget-card--dragging" : ""}`}
        {...attributes}
      >
        {editMode && (
          <div className="widget-card-toolbar">
            <div className="widget-drag-handle" {...listeners}>
              <div className="widget-drag-dots">
                <span />
                <span />
                <span />
              </div>
              {entry.definition.name}
            </div>
            <div className="widget-card-actions">
              {hasSettings && (
                <button
                  className="widget-action-btn"
                  onClick={() => setShowSettings(true)}
                  aria-label="Widget settings"
                  title="Settings"
                >
                  &#9881;
                </button>
              )}
              <button
                className="widget-action-btn widget-action-btn--remove"
                onClick={() => onRemove(widget.id)}
                aria-label="Remove widget"
                title="Remove"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        <div className="widget-card-content">
          <WidgetComponent data={data} config={widget.config} />
        </div>
      </div>

      {showSettings && hasSettings && (
        <WidgetSettings
          definition={entry.definition}
          config={widget.config}
          onConfigChange={(key, value) => {
            onUpdateConfig(widget.id, { ...widget.config, [key]: value });
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}

/* Skeleton placeholder for loading state */
export function WidgetSkeleton({ w, h }: { w: number; h: number }) {
  return (
    <div
      className="widget-skeleton"
      style={{ gridColumn: `span ${w}`, gridRow: `span ${h}` }}
    >
      <div className="widget-skeleton-inner" />
    </div>
  );
}
