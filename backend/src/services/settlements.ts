import { createUserClient, adminClient } from "../lib/supabase.js";
import { AppError } from "../lib/errors.js";
import { buildAppSpecificUpiLinks } from "@chalk/shared";
import { fetchPendingSettlement } from "./helpers.js";

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
  await fetchPendingSettlement(settlementId, userId, "payee");

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
  await fetchPendingSettlement(settlementId, userId, "payee");

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
  await fetchPendingSettlement(settlementId, userId, "payer");

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
