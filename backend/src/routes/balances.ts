import { Router, type Request, type Response } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { createUserClient } from "../lib/supabase.js";
import { calculateNetBalances, simplifyDebts } from "@chalk/shared";

const router = Router();
router.use(requireAuth);

// ─── Get group balances (who owes whom) ─────────────────────
router.get("/group/:groupId", async (req: Request, res: Response) => {
  const { accessToken } = req as AuthRequest;
  const { groupId } = req.params;
  const supabase = createUserClient(accessToken);

  // Fetch expenses, splits, and settlements for this group in parallel
  const [expensesRes, splitsRes, settlementsRes, membersRes] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, paid_by, total_amount")
      .eq("group_id", groupId)
      .is("deleted_at", null),
    supabase
      .from("expense_splits")
      .select("user_id, amount_owed, expenses!inner(group_id)")
      .eq("expenses.group_id", groupId),
    supabase
      .from("settlements")
      .select("from_user, to_user, amount, status")
      .or(
        `from_user.in.(select user_id from group_members where group_id.eq.${groupId}),to_user.in.(select user_id from group_members where group_id.eq.${groupId})`
      ),
    supabase
      .from("group_members")
      .select("user_id, users(id, name, upi_id)")
      .eq("group_id", groupId),
  ]);

  if (expensesRes.error || splitsRes.error) {
    res.status(400).json({ error: "Failed to fetch balance data" });
    return;
  }

  const expenses = expensesRes.data ?? [];
  const splits = (splitsRes.data ?? []).map((s) => ({
    user_id: s.user_id,
    amount_owed: s.amount_owed,
  }));
  const settlements = (settlementsRes.data ?? []).map((s) => ({
    from_user: s.from_user,
    to_user: s.to_user,
    amount: s.amount,
    status: s.status,
  }));

  const netBalances = calculateNetBalances(expenses, splits, settlements);
  const debts = simplifyDebts(netBalances);

  // Build a name lookup from members
  const memberMap = new Map<string, { name: string; upi_id: string | null }>();
  for (const m of membersRes.data ?? []) {
    const user = m.users as unknown as { id: string; name: string; upi_id: string | null };
    memberMap.set(user.id, { name: user.name, upi_id: user.upi_id });
  }

  const enrichedDebts = debts.map((d) => ({
    ...d,
    from_name: memberMap.get(d.from)?.name ?? "Unknown",
    to_name: memberMap.get(d.to)?.name ?? "Unknown",
    to_upi_id: memberMap.get(d.to)?.upi_id ?? null,
  }));

  res.json({
    balances: Object.fromEntries(netBalances),
    debts: enrichedDebts,
  });
});

export default router;
