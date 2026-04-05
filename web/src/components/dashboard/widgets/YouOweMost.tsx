import { formatPaise } from "../../../lib/format";
import type { WidgetProps } from "./types";

export function YouOweMost({ data }: WidgetProps) {
  const { youOweMostIn } = data;

  if (!youOweMostIn) {
    return (
      <div className="widget-stat">
        <span className="widget-stat-label">You Owe Most In</span>
        <span className="widget-stat-value">All clear!</span>
      </div>
    );
  }

  return (
    <div className="widget-stat">
      <span className="widget-stat-label">You Owe Most In</span>
      <span className="widget-stat-name">{youOweMostIn.groupName}</span>
      <span className="widget-stat-value amount amount--negative">
        {formatPaise(youOweMostIn.amount)}
      </span>
    </div>
  );
}
