import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { calculateNetBalances, simplifyDebts } from "@chalk/shared";
import { requireGroupMembership } from "./helpers.js";

export async function getGroupBalances(groupId: string, userId: string) {
  await requireGroupMembership(groupId, userId);

  const members = await prisma.group_members.findMany({
    where: { group_id: groupId },
    include: {
      users: {
        select: { id: true, name: true, upi_id: true },
      },
    },
  });

  const memberIds = members.map((m) => m.user_id);

  if (memberIds.length === 0) {
    return { balances: {}, debts: [] };
  }

  const [expenses, splits, settlements] = await Promise.all([
    prisma.expenses.findMany({
      where: { group_id: groupId, deleted_at: null },
      select: { id: true, paid_by: true, total_amount: true },
    }),
    prisma.expense_splits.findMany({
      where: {
        expenses: { group_id: groupId, deleted_at: null },
      },
      select: { user_id: true, amount_owed: true },
    }),
    prisma.settlements.findMany({
      where: {
        from_user: { in: memberIds },
        to_user: { in: memberIds },
      },
      select: { from_user: true, to_user: true, amount: true, status: true },
    }),
  ]);

  const netBalances = calculateNetBalances(expenses, splits, settlements);
  const debts = simplifyDebts(netBalances);

  const memberMap = new Map<string, { name: string; upi_id: string | null }>();
  for (const m of members) {
    memberMap.set(m.users.id, { name: m.users.name, upi_id: m.users.upi_id });
  }

  const enrichedDebts = debts.map((d) => ({
    ...d,
    from_name: memberMap.get(d.from)?.name ?? "Unknown",
    to_name: memberMap.get(d.to)?.name ?? "Unknown",
    to_upi_id: memberMap.get(d.to)?.upi_id ?? null,
  }));

  return {
    balances: Object.fromEntries(netBalances),
    debts: enrichedDebts,
  };
}
