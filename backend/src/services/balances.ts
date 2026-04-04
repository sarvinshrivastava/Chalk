import { createUserClient, adminClient } from "../lib/supabase.js";
import { AppError } from "../lib/errors.js";
import { calculateNetBalances, simplifyDebts } from "@chalk/shared";

export async function getGroupBalances(groupId: string, accessToken: string) {
  const supabase = createUserClient(accessToken);

  const { data: membersData, error: membersErr } = await supabase
    .from("group_members")
    .select("user_id, users(id, name, upi_id)")
    .eq("group_id", groupId);

  if (membersErr)
    throw new AppError(400, membersErr.message, "MEMBERS_FETCH_FAILED");

  const members = membersData ?? [];
  const memberIds = members.map((m) => m.user_id);

  if (memberIds.length === 0) {
    return { balances: {}, debts: [] };
  }

  const [expensesRes, splitsRes, settlementsRes] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, paid_by, total_amount")
      .eq("group_id", groupId)
      .is("deleted_at", null),
    supabase
      .from("expense_splits")
      .select("user_id, amount_owed, expenses!inner(group_id, deleted_at)")
      .eq("expenses.group_id", groupId)
      .is("expenses.deleted_at", null),
    adminClient
      .from("settlements")
      .select("from_user, to_user, amount, status")
      .in("from_user", memberIds)
      .in("to_user", memberIds),
  ]);

  if (expensesRes.error)
    throw new AppError(
      400,
      "Failed to fetch expenses",
      "EXPENSES_FETCH_FAILED",
    );
  if (splitsRes.error)
    throw new AppError(400, "Failed to fetch splits", "SPLITS_FETCH_FAILED");

  const expenses = expensesRes.data ?? [];
  const splits = (splitsRes.data ?? []).map((s) => ({
    user_id: s.user_id,
    amount_owed: s.amount_owed,
  }));
  const settlements = (settlementsRes.data ?? []).map((s) => ({
    from_user: s.from_user,
    to_user: s.to_user,
    amount: s.amount,
    status: s.status as string,
  }));

  const netBalances = calculateNetBalances(expenses, splits, settlements);
  const debts = simplifyDebts(netBalances);

  const memberMap = new Map<string, { name: string; upi_id: string | null }>();
  for (const m of members) {
    const user = m.users as unknown as {
      id: string;
      name: string;
      upi_id: string | null;
    };
    memberMap.set(user.id, { name: user.name, upi_id: user.upi_id });
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
