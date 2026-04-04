import { z } from "zod";

export const createSettlementSchema = z.object({
  to_user: z.string().uuid("Invalid user ID"),
  amount: z
    .number()
    .int("Amount must be an integer (paise)")
    .positive("Amount must be positive"),
});

export const txnRefSchema = z.object({
  upi_txn_id: z.string().min(1, "Transaction reference is required").max(100),
});

export const settlementIdParamSchema = z.object({
  settlementId: z.string().uuid("Invalid settlement ID"),
});
