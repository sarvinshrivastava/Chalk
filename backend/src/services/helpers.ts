import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "../lib/supabase.js";
import { AppError } from "../lib/errors.js";

/** Verify the current user is a member of the given group (via RLS). */
export async function requireGroupMembership(
  supabase: SupabaseClient,
  groupId: string,
): Promise<void> {
  const { data } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .limit(1)
    .maybeSingle();

  if (!data)
    throw new AppError(403, "You are not a member of this group", "NOT_MEMBER");
}

/**
 * Fetch a settlement by ID and verify it is in "pending" status
 * and belongs to the expected user in the given role.
 */
export async function fetchPendingSettlement(
  settlementId: string,
  userId: string,
  role: "payee" | "payer",
): Promise<Record<string, unknown>> {
  const { data: settlement } = await adminClient
    .from("settlements")
    .select("*")
    .eq("id", settlementId)
    .single();

  if (!settlement)
    throw new AppError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");

  const roleField = role === "payee" ? "to_user" : "from_user";
  const roleLabel = role === "payee" ? "payee" : "payer";

  if (settlement[roleField] !== userId) {
    throw new AppError(
      403,
      `Only the ${roleLabel} can perform this action`,
      role === "payee" ? "NOT_PAYEE" : "NOT_PAYER",
    );
  }

  if (role === "payee" && settlement.status !== "pending") {
    throw new AppError(
      409,
      `Settlement is already ${settlement.status}`,
      "INVALID_STATUS",
    );
  }

  return settlement;
}
