import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatPaise } from "../../../lib/format";
import type { WidgetProps } from "./types";

export function SpendingByGroup({ data, config }: WidgetProps) {
  const chartData = data.spendingByGroup.map((g) => ({
    name: g.groupName,
    spent: g.totalSpent,
  }));

  const isHorizontal = config.chartType === "horizontal";

  if (chartData.length === 0) {
    return <p className="widget-empty">No spending data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        layout={isHorizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
      >
        {isHorizontal ? (
          <>
            <XAxis
              type="number"
              tickFormatter={(v: number) => formatPaise(v)}
            />
            <YAxis type="category" dataKey="name" width={80} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v: number) => formatPaise(v)} />
          </>
        )}
        <Tooltip formatter={(value: number) => formatPaise(value)} />
        <Bar dataKey="spent" fill="#0A6E5A" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
