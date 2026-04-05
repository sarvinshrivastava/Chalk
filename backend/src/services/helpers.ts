import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import type { SettlementStatus } from "@chalk/shared";

/** Verify the current user is a member of the given group. */
export async function requireGroupMembership(
  groupId: string,
  userId: string,
): Promise<void> {
  const member = await prisma.group_members.findUnique({
    where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    select: { user_id: true },
  });

  if (!member) {
    throw new AppError(403, "You are not a member of this group", "NOT_MEMBER");
  }
}

/**
 * Fetch a settlement by ID and verify it is in "pending" status
 * and belongs to the expected user in the given role.
 */
export async function fetchPendingSettlement(
  settlementId: string,
  userId: string,
  role: "payee" | "payer",
) {
  const settlement = await prisma.settlements.findUnique({
    where: { id: settlementId },
  });

  if (!settlement) {
    throw new AppError(404, "Settlement not found", "SETTLEMENT_NOT_FOUND");
  }

  const roleField = role === "payee" ? "to_user" : "from_user";
  const roleLabel = role === "payee" ? "payee" : "payer";

  if (settlement[roleField] !== userId) {
    throw new AppError(
      403,
      `Only the ${roleLabel} can perform this action`,
      role === "payee" ? "NOT_PAYEE" : "NOT_PAYER",
    );
  }

  if (
    role === "payee" &&
    (settlement.status as SettlementStatus) !== "pending"
  ) {
    throw new AppError(
      409,
      `Settlement is already ${settlement.status}`,
      "INVALID_STATUS",
    );
  }

  return settlement;
}
