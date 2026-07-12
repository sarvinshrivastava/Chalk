import { useState } from "react";
import { WIDGET_REGISTRY } from "./widgets";
import type { WidgetInstance } from "../../lib/services/dashboard";
import "./WidgetPicker.css";

interface WidgetPickerProps {
  currentLayout: WidgetInstance[];
  onAddWidget: (instance: WidgetInstance) => void;
}

export function WidgetPicker({
  currentLayout,
  onAddWidget,
}: WidgetPickerProps) {
  const [open, setOpen] = useState(false);

  const usedTypes = new Set(currentLayout.map((w) => w.type));
  const available = Object.entries(WIDGET_REGISTRY).filter(
    ([type]) => !usedTypes.has(type),
  );

  function handleAdd(type: string) {
    const entry = WIDGET_REGISTRY[type];
    if (!entry) return;

    const instance: WidgetInstance = {
      id: crypto.randomUUID(),
      type,
      position: {
        x: 0,
        y: 0,
        w: entry.definition.defaultSize.w,
        h: entry.definition.defaultSize.h,
      },
      config: buildDefaultConfig(entry.definition),
    };

    onAddWidget(instance);
  }

  if (!open) {
    return (
      <button
        className="btn btn-outline"
        onClick={() => setOpen(true)}
        style={{ marginTop: 12 }}
      >
        + Add Widget
      </button>
    );
  }

  return (
    <>
      <div className="widget-picker-backdrop" onClick={() => setOpen(false)} />
      <div className="widget-picker">
        <div className="widget-picker-header">
          <h2>Add Widget</h2>
          <button
            className="widget-picker-close"
            onClick={() => setOpen(false)}
            aria-label="Close picker"
          >
            &times;
          </button>
        </div>

        <div className="widget-picker-list">
          {available.length === 0 ? (
            <p className="widget-picker-empty">
              All widgets are already on your dashboard.
            </p>
          ) : (
            available.map(([type, entry]) => (
              <div key={type} className="widget-picker-item">
                <div className="widget-picker-info">
                  <div className="widget-picker-name">
                    {entry.definition.name}
                  </div>
                  <div className="widget-picker-desc">
                    {entry.definition.description}
                  </div>
                </div>
                <button
                  className="widget-picker-add"
                  onClick={() => handleAdd(type)}
                >
                  Add
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function buildDefaultConfig(def: {
  configurable?: { key: string; default: string | boolean }[];
}): Record<string, string | boolean> {
  const config: Record<string, string | boolean> = {};
  if (def.configurable) {
    for (const field of def.configurable) {
      config[field.key] = field.default;
    }
  }
  return config;
}
