import { Router, type Request, type Response } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { createUserClient } from "../lib/supabase.js";
import { adminClient } from "../lib/supabase.js";

const router = Router();
router.use(requireAuth);

// ─── Create expense (equal split) ───────────────────────────
router.post("/", async (req: Request, res: Response) => {
  const { userId, accessToken } = req as AuthRequest;
  const { group_id, total_amount, description, split_type, split_with } = req.body;

  // Validate required fields
  if (!group_id || !total_amount || !split_with?.length) {
    res.status(400).json({
      error: "group_id, total_amount, and split_with (user IDs array) are required",
    });
    return;
  }

  // total_amount is in paise — must be a positive integer
  if (!Number.isInteger(total_amount) || total_amount <= 0) {
    res.status(400).json({ error: "total_amount must be a positive integer (paise)" });
    return;
  }

  const type = split_type || "equal";
  if (!["equal", "by_item", "custom_percent", "custom_amount"].includes(type)) {
    res.status(400).json({ error: "Invalid split_type" });
    return;
  }

  // Verify requester is in the group
  const supabase = createUserClient(accessToken);
  const { data: membership } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", group_id)
    .limit(1)
    .single();

  if (!membership) {
    res.status(403).json({ error: "You are not a member of this group" });
    return;
  }

  // Create expense
  const { data: expense, error: expenseErr } = await adminClient
    .from("expenses")
    .insert({
      group_id,
      paid_by: userId,
      total_amount,
      description: description || "",
      split_type: type,
    })
    .select()
    .single();

  if (expenseErr) {
    res.status(400).json({ error: expenseErr.message });
    return;
  }

  // Calculate splits
  const splits = calculateSplits(type, total_amount, split_with, req.body);

  // Insert splits
  const splitRows = splits.map((s) => ({
    expense_id: expense.id,
    user_id: s.user_id,
    amount_owed: s.amount_owed,
  }));

  const { error: splitErr } = await adminClient
    .from("expense_splits")
    .insert(splitRows);

  if (splitErr) {
    res.status(400).json({ error: splitErr.message });
    return;
  }

  res.status(201).json({ expense, splits: splitRows });
});

// ─── List expenses for a group ──────────────────────────────
router.get("/group/:groupId", async (req: Request, res: Response) => {
  const { accessToken } = req as AuthRequest;
  const { groupId } = req.params;
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from("expenses")
    .select(
      "*, expense_splits(id, user_id, amount_owed), users!expenses_paid_by_fkey(name)"
    )
    .eq("group_id", groupId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ expenses: data });
});

// ─── Get single expense detail ──────────────────────────────
router.get("/:expenseId", async (req: Request, res: Response) => {
  const { accessToken } = req as AuthRequest;
  const { expenseId } = req.params;
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from("expenses")
    .select("*, expense_splits(id, user_id, amount_owed)")
    .eq("id", expenseId)
    .single();

  if (error) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }

  res.json({ expense: data });
});

// ─── Soft delete expense ────────────────────────────────────
router.delete("/:expenseId", async (req: Request, res: Response) => {
  const { userId, accessToken } = req as AuthRequest;
  const { expenseId } = req.params;
  const supabase = createUserClient(accessToken);

  // Only the payer can delete
  const { data: expense } = await supabase
    .from("expenses")
    .select("paid_by")
    .eq("id", expenseId)
    .single();

  if (!expense || expense.paid_by !== userId) {
    res.status(403).json({ error: "Only the payer can delete this expense" });
    return;
  }

  const { error } = await adminClient
    .from("expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", expenseId);

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ ok: true });
});

// ─── Split calculation helpers ──────────────────────────────

interface SplitEntry {
  user_id: string;
  amount_owed: number;
}

function calculateSplits(
  type: string,
  totalPaise: number,
  splitWith: string[],
  body: Record<string, unknown>
): SplitEntry[] {
  switch (type) {
    case "equal":
      return equalSplit(totalPaise, splitWith);
    case "custom_percent":
      return percentSplit(totalPaise, body.percentages as Record<string, number>);
    case "custom_amount":
      return amountSplit(body.amounts as Record<string, number>);
    default:
      return equalSplit(totalPaise, splitWith);
  }
}

function equalSplit(totalPaise: number, userIds: string[]): SplitEntry[] {
  const count = userIds.length;
  const base = Math.floor(totalPaise / count);
  const remainder = totalPaise - base * count;

  return userIds.map((user_id, i) => ({
    user_id,
    // Distribute remainder 1 paise at a time to first N people
    amount_owed: base + (i < remainder ? 1 : 0),
  }));
}

function percentSplit(
  totalPaise: number,
  percentages: Record<string, number>
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

export default router;
