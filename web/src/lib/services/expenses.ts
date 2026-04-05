import type { Paise, SplitType, ExpenseSplit } from "@chalk/shared";
import { get, post, del } from "../api";

export interface ExpenseWithDetails {
  id: string;
  group_id: string;
  paid_by: string;
  total_amount: Paise;
  description: string;
  split_type: SplitType;
  created_at: string;
  expense_splits: { id: string; user_id: string; amount_owed: Paise }[];
  users: { name: string };
}

interface CreateExpenseInput {
  group_id: string;
  total_amount: Paise;
  description: string;
  split_type: SplitType;
  split_with?: string[];
  percentages?: Record<string, number>;
  amounts?: Record<string, number>;
}

export async function fetchGroupExpenses(groupId: string) {
  const { expenses } = await get<{ expenses: ExpenseWithDetails[] }>(
    `/expenses/group/${groupId}`,
  );
  return expenses;
}

export async function createExpense(input: CreateExpenseInput) {
  return post<{ expense: ExpenseWithDetails; splits: ExpenseSplit[] }>(
    "/expenses",
    input,
  );
}

export async function getExpense(expenseId: string) {
  const { expense } = await get<{ expense: ExpenseWithDetails }>(
    `/expenses/${expenseId}`,
  );
  return expense;
}

export async function deleteExpense(expenseId: string) {
  return del<{ ok: true }>(`/expenses/${expenseId}`);
}
