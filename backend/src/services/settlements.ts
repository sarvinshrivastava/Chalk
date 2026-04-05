import { prisma } from "../lib/prisma.js";
import { AppError, withPrismaErrors } from "../lib/errors.js";
import { buildAppSpecificUpiLinks } from "@chalk/shared";
import { fetchPendingSettlement } from "./helpers.js";
import { invalidateDashboardCache } from "./dashboard.js";

export async function createSettlement(
  userId: string,
  toUser: string,
  amount: number,
  groupId?: string,
) {
  if (userId === toUser) {
    throw new AppError(400, "Cannot settle with yourself", "SELF_SETTLEMENT");
  }

  const payee = await prisma.users.findUnique({
    where: { id: toUser },
    select: { id: true, name: true, upi_id: true },
  });

  if (!payee) {
    throw new AppError(404, "Payee not found", "PAYEE_NOT_FOUND");
  }

  const settlement = await withPrismaErrors(() =>
    prisma.settlements.create({
      data: {
        from_user: userId,
        to_user: toUser,
        amount,
        status: "pending",
        ...(groupId && { group_id: groupId }),
      },
    }),
  );

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

  invalidateDashboardCache(userId);
  return { settlement, upi_links: upiLinks };
}

export async function confirmSettlement(settlementId: string, userId: string) {
  await fetchPendingSettlement(settlementId, userId, "payee");

  const settlement = await withPrismaErrors(() =>
    prisma.settlements.update({
      where: { id: settlementId },
      data: { status: "confirmed", paid_at: new Date() },
    }),
  );

  invalidateDashboardCache(userId);
  return settlement;
}

export async function rejectSettlement(settlementId: string, userId: string) {
  await fetchPendingSettlement(settlementId, userId, "payee");

  const settlement = await withPrismaErrors(() =>
    prisma.settlements.update({
      where: { id: settlementId },
      data: { status: "rejected" },
    }),
  );

  invalidateDashboardCache(userId);
  return settlement;
}

export async function addTxnRef(
  settlementId: string,
  userId: string,
  upiTxnId: string,
) {
  await fetchPendingSettlement(settlementId, userId, "payer");

  return withPrismaErrors(() =>
    prisma.settlements.update({
      where: { id: settlementId },
      data: { upi_txn_id: upiTxnId },
    }),
  );
}

export async function listSettlements(userId: string) {
  return prisma.settlements.findMany({
    where: {
      deleted_at: null,
      OR: [{ from_user: userId }, { to_user: userId }],
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      from_user: true,
      to_user: true,
      amount: true,
      status: true,
      upi_txn_id: true,
      paid_at: true,
      created_at: true,
    },
  });
}
