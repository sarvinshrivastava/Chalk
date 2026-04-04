import { createUserClient, adminClient } from "../lib/supabase.js";
import { AppError } from "../lib/errors.js";

interface SplitEntry {
  user_id: string;
  amount_owed: number;
}

interface CreateExpenseInput {
  group_id: string;
  total_amount: number;
  description: string;
  split_type: "equal" | "custom_percent" | "custom_amount";
  split_with?: string[];
  percentages?: Record<string, number>;
  amounts?: Record<string, number>;
}

export async function createExpense(
  userId: string,
  accessToken: string,
  input: CreateExpenseInput,
) {
  const supabase = createUserClient(accessToken);
  const { data: membership } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", input.group_id)
    .limit(1)
    .maybeSingle();

  if (!membership)
    throw new AppError(403, "You are not a member of this group", "NOT_MEMBER");

  const participantIds = getParticipantIds(input);
  const { data: members } = await adminClient
    .from("group_members")
    .select("user_id")
    .eq("group_id", input.group_id)
    .in("user_id", participantIds);

  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  const nonMembers = participantIds.filter((id) => !memberIds.has(id));
  if (nonMembers.length > 0) {
    throw new AppError(
      400,
      "Some split participants are not group members",
      "INVALID_PARTICIPANTS",
    );
  }

  const splits = calculateSplits(input);

  const { data: expense, error: expenseErr } = await adminClient
    .from("expenses")
    .insert({
      group_id: input.group_id,
      paid_by: userId,
      total_amount: input.total_amount,
      description: input.description,
      split_type: input.split_type,
    })
    .select()
    .single();

  if (expenseErr)
    throw new AppError(400, expenseErr.message, "EXPENSE_CREATE_FAILED");

  const splitRows = splits.map((s) => ({
    expense_id: expense!.id,
    user_id: s.user_id,
    amount_owed: s.amount_owed,
  }));

  const { error: splitErr } = await adminClient
    .from("expense_splits")
    .insert(splitRows);
  if (splitErr)
    throw new AppError(400, splitErr.message, "SPLITS_CREATE_FAILED");

  return { expense, splits: splitRows };
}

export async function listGroupExpenses(groupId: string, accessToken: string) {
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from("expenses")
    .select(
      "*, expense_splits(id, user_id, amount_owed), users!expenses_paid_by_fkey(name)",
    )
    .eq("group_id", groupId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new AppError(400, error.message, "EXPENSES_FETCH_FAILED");
  return data ?? [];
}

export async function getExpense(expenseId: string, accessToken: string) {
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from("expenses")
    .select("*, expense_splits(id, user_id, amount_owed)")
    .eq("id", expenseId)
    .is("deleted_at", null)
    .single();

  if (error || !data)
    throw new AppError(404, "Expense not found", "EXPENSE_NOT_FOUND");
  return data;
}

export async function deleteExpense(
  expenseId: string,
  userId: string,
  accessToken: string,
) {
  const supabase = createUserClient(accessToken);

  const { data: expense } = await supabase
    .from("expenses")
    .select("paid_by")
    .eq("id", expenseId)
    .is("deleted_at", null)
    .single();

  if (!expense)
    throw new AppError(404, "Expense not found", "EXPENSE_NOT_FOUND");
  if (expense.paid_by !== userId)
    throw new AppError(
      403,
      "Only the payer can delete this expense",
      "NOT_PAYER",
    );

  const { error } = await adminClient
    .from("expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", expenseId);

  if (error) throw new AppError(400, error.message, "DELETE_FAILED");
}

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
