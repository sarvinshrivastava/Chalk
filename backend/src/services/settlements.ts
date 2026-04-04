import { createUserClient, adminClient } from "../lib/supabase.js";
import { AppError } from "../lib/errors.js";
import { buildAppSpecificUpiLinks } from "@chalk/shared";

export async function createSettlement(
  userId: string,
  toUser: string,
  amount: number,
) {
  if (userId === toUser)
    throw new AppError(400, "Cannot settle with yourself", "SELF_SETTLEMENT");

  const { data: payee } = await adminClient
    .from("users")
    .select("id, name, upi_id")
    .eq("id", toUser)
    .single();

  if (!payee) throw new AppError(404, "Payee not found", "PAYEE_NOT_FOUND");

  const { data: settlement, error } = await adminClient
    .from("settlements")
    .insert({
      from_user: userId,
      to_user: toUser,
      amount,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw new AppError(400, error.message, "SETTLEMENT_CREATE_FAILED");

  let upiLinks = null;
  if (payee.upi_id) {
    try {
      upiLinks = buildAppSpecificUpiLinks({
        payeeVpa: payee.upi_id,
        payeeName: payee.name,
        amount,
        note: "Chalk settlement",
      });
    } catch {
      // Invalid VPA — return settlement without links
    }
  }

  return { settlement, upi_links: upiLinks };
}

export async function confirmSettlement(settlementId: string, userId: string) {
  const { data: settlement } = await adminClient
    .from("settlements")
    .select("*")
    .eq("id", settlementId)
    .single();

  if (!settlement)
    throw new AppError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
  if (settlement.to_user !== userId)
    throw new AppError(403, "Only the payee can confirm", "NOT_PAYEE");
  if (settlement.status !== "pending")
    throw new AppError(
      409,
      `Settlement is already ${settlement.status}`,
      "INVALID_STATUS",
    );

  const { data, error } = await adminClient
    .from("settlements")
    .update({ status: "confirmed", paid_at: new Date().toISOString() })
    .eq("id", settlementId)
    .select()
    .single();

  if (error) throw new AppError(400, error.message, "CONFIRM_FAILED");
  return data;
}

export async function rejectSettlement(settlementId: string, userId: string) {
  const { data: settlement } = await adminClient
    .from("settlements")
    .select("*")
    .eq("id", settlementId)
    .single();

  if (!settlement)
    throw new AppError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
  if (settlement.to_user !== userId)
    throw new AppError(403, "Only the payee can reject", "NOT_PAYEE");
  if (settlement.status !== "pending")
    throw new AppError(
      409,
      `Settlement is already ${settlement.status}`,
      "INVALID_STATUS",
    );

  const { data, error } = await adminClient
    .from("settlements")
    .update({ status: "rejected" })
    .eq("id", settlementId)
    .select()
    .single();

  if (error) throw new AppError(400, error.message, "REJECT_FAILED");
  return data;
}

export async function addTxnRef(
  settlementId: string,
  userId: string,
  upiTxnId: string,
) {
  const { data: settlement } = await adminClient
    .from("settlements")
    .select("from_user")
    .eq("id", settlementId)
    .single();

  if (!settlement)
    throw new AppError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
  if (settlement.from_user !== userId)
    throw new AppError(
      403,
      "Only the payer can add a transaction reference",
      "NOT_PAYER",
    );

  const { data, error } = await adminClient
    .from("settlements")
    .update({ upi_txn_id: upiTxnId })
    .eq("id", settlementId)
    .select()
    .single();

  if (error) throw new AppError(400, error.message, "TXN_REF_FAILED");
  return data;
}

export async function listSettlements(accessToken: string) {
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from("settlements")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new AppError(400, error.message, "SETTLEMENTS_FETCH_FAILED");
  return data ?? [];
}
