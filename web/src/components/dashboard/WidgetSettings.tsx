import type { WidgetDefinition } from "./widgets";
import "./WidgetSettings.css";

interface WidgetSettingsProps {
  definition: WidgetDefinition;
  config: Record<string, string | boolean>;
  onConfigChange: (key: string, value: string | boolean) => void;
  onClose: () => void;
}

export function WidgetSettings({
  definition,
  config,
  onConfigChange,
  onClose,
}: WidgetSettingsProps) {
  if (!definition.configurable || definition.configurable.length === 0) {
    return null;
  }

  return (
    <div className="widget-settings-overlay" onClick={onClose}>
      <div className="widget-settings" onClick={(e) => e.stopPropagation()}>
        <div className="widget-settings-header">
          <h3>{definition.name} Settings</h3>
          <button
            className="widget-settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            &times;
          </button>
        </div>

        {definition.configurable.map((field) => (
          <div key={field.key} className="widget-settings-field">
            <label className="widget-settings-label">{field.label}</label>
            {field.type === "select" && field.options ? (
              <select
                className="widget-settings-select"
                value={String(config[field.key] ?? field.default)}
                onChange={(e) => onConfigChange(field.key, e.target.value)}
              >
                {field.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : field.type === "toggle" ? (
              <label className="widget-settings-toggle-label">
                <input
                  type="checkbox"
                  checked={Boolean(config[field.key] ?? field.default)}
                  onChange={(e) => onConfigChange(field.key, e.target.checked)}
                />
                <span>{field.label}</span>
              </label>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
