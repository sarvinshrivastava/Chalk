import { formatPaise } from "../../../lib/format";
import type { WidgetProps } from "./types";

export function NetBalance({ data }: WidgetProps) {
  const { totalOwedToYou, totalYouOwe, netBalance } = data;

  return (
    <div className="widget-net-balance">
      <div className="net-stat">
        <span className="net-stat-label">Owed to you</span>
        <span className="net-stat-value amount amount--positive">
          {formatPaise(totalOwedToYou)}
        </span>
      </div>
      <div className="net-stat">
        <span className="net-stat-label">You owe</span>
        <span className="net-stat-value amount amount--negative">
          {formatPaise(totalYouOwe)}
        </span>
      </div>
      <div className="net-stat">
        <span className="net-stat-label">Net balance</span>
        <span
          className={`net-stat-value amount ${
            netBalance >= 0 ? "amount--positive" : "amount--negative"
          }`}
        >
          {formatPaise(netBalance)}
        </span>
      </div>
    </div>
  );
}
