import type { Paise } from "./types.js";

export interface BalanceEntry {
  userId: string;
  balance: Paise; // positive = owed to them, negative = they owe
}

export interface DebtEdge {
  from: string; // debtor
  to: string; // creditor
  amount: Paise;
}

/**
 * Calculate net balances for a group from expense splits and settlements.
 * All values in paise.
 */
export function calculateNetBalances(
  expenses: { paid_by: string; total_amount: Paise }[],
  splits: { user_id: string; amount_owed: Paise }[],
  settlements: { from_user: string; to_user: string; amount: Paise; status: string }[]
): Map<string, Paise> {
  const balances = new Map<string, Paise>();

  const addBalance = (userId: string, amount: Paise) => {
    balances.set(userId, (balances.get(userId) ?? 0) + amount);
  };

  // Payers are owed money
  for (const expense of expenses) {
    addBalance(expense.paid_by, expense.total_amount);
  }

  // Splits reduce what you're owed (you owe your share)
  for (const split of splits) {
    addBalance(split.user_id, -split.amount_owed);
  }

  // Confirmed settlements reduce debts
  for (const settlement of settlements) {
    if (settlement.status === "confirmed") {
      addBalance(settlement.from_user, settlement.amount);
      addBalance(settlement.to_user, -settlement.amount);
    }
  }

  return balances;
}

/**
 * Simplify debts: minimize the number of transactions needed to settle.
 * Returns a list of who pays whom.
 */
export function simplifyDebts(netBalances: Map<string, Paise>): DebtEdge[] {
  const debtors: { userId: string; amount: Paise }[] = [];
  const creditors: { userId: string; amount: Paise }[] = [];

  for (const [userId, balance] of netBalances) {
    if (balance < 0) {
      debtors.push({ userId, amount: -balance });
    } else if (balance > 0) {
      creditors.push({ userId, amount: balance });
    }
  }

  // Sort descending by amount for greedy matching
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const edges: DebtEdge[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) {
      edges.push({
        from: debtors[i].userId,
        to: creditors[j].userId,
        amount,
      });
    }
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }

  return edges;
}
