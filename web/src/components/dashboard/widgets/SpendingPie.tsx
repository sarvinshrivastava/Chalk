import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatPaise } from "../../../lib/format";
import type { WidgetProps } from "./types";

const COLORS = ["#0A6E5A", "#B87514", "#1A5FA5", "#C0392B", "#E8993C"];

export function SpendingPie({ data, config }: WidgetProps) {
  const chartData = data.spendingByGroup.map((g) => ({
    name: g.groupName,
    value: g.totalSpent,
  }));

  const isDonut = config.chartType === "donut";

  if (chartData.length === 0) {
    return <p className="widget-empty">No spending data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={isDonut ? 60 : 0}
          outerRadius="80%"
          paddingAngle={2}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => formatPaise(value)} />
      </PieChart>
    </ResponsiveContainer>
  );
}
