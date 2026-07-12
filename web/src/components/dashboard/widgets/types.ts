import type { DashboardData } from "../../../lib/services/dashboard";

export interface WidgetDefinition {
  type: string;
  name: string;
  description: string;
  defaultSize: { w: number; h: number };
  allowedSizes: { w: number; h: number }[];
  configurable?: WidgetConfigField[];
}

export interface WidgetConfigField {
  key: string;
  label: string;
  type: "select" | "toggle";
  options?: { value: string; label: string }[];
  default: string | boolean;
}

export interface WidgetProps {
  data: DashboardData;
  config: Record<string, string | boolean>;
}
