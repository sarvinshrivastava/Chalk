import { z } from "zod";

export const WIDGET_TYPES = [
  "net-balance",
  "spending-by-group",
  "spending-pie",
  "top-debtor",
  "you-owe-most",
  "recent-expenses",
  "pending-settlements",
  "groups-list",
  "monthly-trend",
] as const;

const widgetInstanceSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(WIDGET_TYPES),
  position: z.object({
    x: z.number().int().min(0).max(2),
    y: z.number().int().min(0),
    w: z.number().int().min(1).max(3),
    h: z.number().int().min(1).max(3),
  }),
  config: z.record(z.union([z.string(), z.boolean()])),
});

export const dashboardLayoutSchema = z.object({
  layout: z.array(widgetInstanceSchema).max(20),
});

export type WidgetInstance = z.infer<typeof widgetInstanceSchema>;
