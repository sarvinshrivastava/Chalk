import { Link } from "react-router-dom";
import { formatPaise } from "../../../lib/format";
import type { WidgetProps } from "./types";

export function GroupsList({ data }: WidgetProps) {
  const { groups } = data;

  if (groups.length === 0) {
    return <p className="widget-empty">No groups yet.</p>;
  }

  return (
    <ul className="widget-groups-list">
      {groups.map((group) => (
        <li key={group.id} className="widget-group-row">
          <Link to={`/group/${group.id}`} className="widget-group-link">
            <span className="widget-group-name">{group.name}</span>
            <span
              className={`amount ${
                group.yourBalance >= 0 ? "amount--positive" : "amount--negative"
              }`}
            >
              {formatPaise(group.yourBalance)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
