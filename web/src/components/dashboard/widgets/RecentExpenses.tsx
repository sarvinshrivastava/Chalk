import { formatPaise } from "../../../lib/format";
import type { WidgetProps } from "./types";

export function RecentExpenses({ data, config }: WidgetProps) {
  const count = Number(config.count) || 10;
  const expenses = data.recentExpenses.slice(0, count);

  if (expenses.length === 0) {
    return <p className="widget-empty">No recent expenses.</p>;
  }

  return (
    <ul className="widget-expenses-list">
      {expenses.map((expense, i) => (
        <li key={i} className="widget-expense-row">
          <div className="widget-expense-info">
            <span className="widget-expense-desc">{expense.description}</span>
            <span className="widget-expense-meta">
              Paid by {expense.paidByName}
            </span>
          </div>
          <span className="widget-expense-group-pill">{expense.groupName}</span>
          <span className="amount">{formatPaise(expense.totalAmount)}</span>
        </li>
      ))}
    </ul>
  );
}
