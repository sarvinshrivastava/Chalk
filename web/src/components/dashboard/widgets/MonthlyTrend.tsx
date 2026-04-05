import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatPaise } from "../../../lib/format";
import type { WidgetProps } from "./types";

export function MonthlyTrend({ data, config }: WidgetProps) {
  const period = Number(config.period) || 12;
  const chartType = config.chartType === "area" ? "area" : "line";
  const chartData = data.monthlyTrend.slice(-period).map((m) => ({
    month: m.month,
    spent: m.totalSpent,
  }));

  if (chartData.length === 0) {
    return <p className="widget-empty">No trend data yet.</p>;
  }

  const sharedProps = {
    data: chartData,
    margin: { top: 8, right: 16, bottom: 8, left: 8 },
  };

  return (
    <ResponsiveContainer width="100%" minHeight={140} aspect={2.5}>
      {chartType === "area" ? (
        <AreaChart {...sharedProps}>
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(v: number) => formatPaise(v)} />
          <Tooltip formatter={(value: number) => formatPaise(value)} />
          <Area
            type="monotone"
            dataKey="spent"
            stroke="#0A6E5A"
            fill="#0A6E5A1A"
          />
        </AreaChart>
      ) : (
        <LineChart {...sharedProps}>
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(v: number) => formatPaise(v)} />
          <Tooltip formatter={(value: number) => formatPaise(value)} />
          <Line
            type="monotone"
            dataKey="spent"
            stroke="#0A6E5A"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
