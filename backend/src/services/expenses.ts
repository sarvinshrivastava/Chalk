import { prisma } from "../lib/prisma.js";
import { AppError, withPrismaErrors } from "../lib/errors.js";
import type { SplitType } from "@chalk/shared";
import { requireGroupMembership } from "./helpers.js";
import { invalidateDashboardCache } from "./dashboard.js";

interface SplitEntry {
  user_id: string;
  amount_owed: number;
}

interface CreateExpenseInput {
  group_id: string;
  total_amount: number;
  description: string;
  split_type: Exclude<SplitType, "by_item">;
  split_with?: string[];
  percentages?: Record<string, number>;
  amounts?: Record<string, number>;
}

export async function createExpense(userId: string, input: CreateExpenseInput) {
  const participantIds = getParticipantIds(input);

  // Single query: verify creator membership + validate all participants
  const members = await prisma.group_members.findMany({
    where: { group_id: input.group_id },
    select: { user_id: true },
  });

  const memberIds = new Set(members.map((m) => m.user_id));
  if (!memberIds.has(userId)) {
    throw new AppError(403, "You are not a member of this group", "NOT_MEMBER");
  }

  const nonMembers = participantIds.filter((id) => !memberIds.has(id));
  if (nonMembers.length > 0) {
    throw new AppError(
      400,
      "Some split participants are not group members",
      "INVALID_PARTICIPANTS",
    );
  }

  const splits = calculateSplits(input);

  const result = await withPrismaErrors(() =>
    prisma.$transaction(async (tx) => {
      const expense = await tx.expenses.create({
        data: {
          group_id: input.group_id,
          paid_by: userId,
          total_amount: input.total_amount,
          description: input.description,
          split_type: input.split_type,
        },
      });

      const splitRows = splits.map((s) => ({
        expense_id: expense.id,
        user_id: s.user_id,
        amount_owed: s.amount_owed,
      }));

      await tx.expense_splits.createMany({ data: splitRows });

      return { expense, splits: splitRows };
    }),
  );

  invalidateDashboardCache(userId);
  return result;
}

export async function listGroupExpenses(groupId: string, userId: string) {
  await requireGroupMembership(groupId, userId);

  return prisma.expenses.findMany({
    where: { group_id: groupId, deleted_at: null },
    orderBy: { created_at: "desc" },
    include: {
      expense_splits: {
        select: { id: true, user_id: true, amount_owed: true },
      },
      users: { select: { name: true } },
    },
  });
}

export async function getExpense(expenseId: string, userId: string) {
  const expense = await prisma.expenses.findFirst({
    where: { id: expenseId, deleted_at: null },
    include: {
      expense_splits: {
        select: { id: true, user_id: true, amount_owed: true },
      },
    },
  });

  if (!expense) {
    throw new AppError(404, "Expense not found", "EXPENSE_NOT_FOUND");
  }

  await requireGroupMembership(expense.group_id, userId);

  return expense;
}

export async function deleteExpense(expenseId: string, userId: string) {
  const expense = await prisma.expenses.findFirst({
    where: { id: expenseId, deleted_at: null },
    select: { paid_by: true, group_id: true },
  });

  if (!expense) {
    throw new AppError(404, "Expense not found", "EXPENSE_NOT_FOUND");
  }

  await requireGroupMembership(expense.group_id, userId);

  if (expense.paid_by !== userId) {
    throw new AppError(
      403,
      "Only the payer can delete this expense",
      "NOT_PAYER",
    );
  }

  await prisma.expenses.update({
    where: { id: expenseId },
    data: { deleted_at: new Date() },
  });

  invalidateDashboardCache(userId);
}

// ── Split calculation helpers (unchanged logic) ──────────────────────

function getParticipantIds(input: CreateExpenseInput): string[] {
  switch (input.split_type) {
    case "equal":
      return input.split_with!;
    case "custom_percent":
      return Object.keys(input.percentages!);
    case "custom_amount":
      return Object.keys(input.amounts!);
  }
}

function calculateSplits(input: CreateExpenseInput): SplitEntry[] {
  switch (input.split_type) {
    case "equal":
      return equalSplit(input.total_amount, input.split_with!);
    case "custom_percent":
      return percentSplit(input.total_amount, input.percentages!);
    case "custom_amount":
      return amountSplit(input.amounts!);
  }
}

function equalSplit(totalPaise: number, userIds: string[]): SplitEntry[] {
  const count = userIds.length;
  const base = Math.floor(totalPaise / count);
  const remainder = totalPaise - base * count;

  return userIds.map((user_id, i) => ({
    user_id,
    amount_owed: base + (i < remainder ? 1 : 0),
  }));
}

function percentSplit(
  totalPaise: number,
  percentages: Record<string, number>,
): SplitEntry[] {
  const entries = Object.entries(percentages);
  const splits: SplitEntry[] = [];
  let allocated = 0;

  for (let i = 0; i < entries.length; i++) {
    const [user_id, pct] = entries[i];
    const isLast = i === entries.length - 1;
    const amount = isLast
      ? totalPaise - allocated
      : Math.round((totalPaise * pct) / 100);
    allocated += amount;
    splits.push({ user_id, amount_owed: amount });
  }

  return splits;
}

function amountSplit(amounts: Record<string, number>): SplitEntry[] {
  return Object.entries(amounts).map(([user_id, amount_owed]) => ({
    user_id,
    amount_owed,
  }));
}
