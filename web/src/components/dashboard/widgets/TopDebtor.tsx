import { formatPaise } from "../../../lib/format";
import type { WidgetProps } from "./types";

export function TopDebtor({ data }: WidgetProps) {
  const { topDebtor } = data;

  if (!topDebtor) {
    return (
      <div className="widget-stat">
        <span className="widget-stat-label">Top Debtor</span>
        <span className="widget-stat-value">No debts</span>
      </div>
    );
  }

  return (
    <div className="widget-stat">
      <span className="widget-stat-label">Top Debtor</span>
      <span className="widget-stat-name">{topDebtor.name}</span>
      <span className="widget-stat-value amount amount--negative">
        {formatPaise(topDebtor.amount)}
      </span>
    </div>
  );
}
