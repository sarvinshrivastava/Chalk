import { Link } from "react-router-dom";
import { formatPaise } from "../../../lib/format";
import type { WidgetProps } from "./types";

export function PendingSettlements({ data }: WidgetProps) {
  const { pendingSettlements } = data;

  if (pendingSettlements.length === 0) {
    return <p className="widget-empty">No pending settlements.</p>;
  }

  return (
    <ul className="widget-settlements-list">
      {pendingSettlements.map((s, i) => (
        <li key={i} className="widget-settlement-row">
          <div className="widget-settlement-info">
            <span>
              {s.fromName} owes {s.toName}:{" "}
              <span className="amount amount--negative">
                {formatPaise(s.amount)}
              </span>
            </span>
            {s.groupName && (
              <span className="widget-settlement-group">{s.groupName}</span>
            )}
          </div>
          {s.groupId && (
            <Link
              to={`/group/${s.groupId}/settle`}
              className="widget-settle-link"
            >
              Settle
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
