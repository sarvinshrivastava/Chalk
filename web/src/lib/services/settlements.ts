import type { Settlement } from "@chalk/shared";
import { get, post, patch } from "../api";

interface UpiLinks {
  generic: string;
  gpay: string;
  phonepe: string;
  paytm: string;
}

interface CreateSettlementResponse {
  settlement: Settlement;
  upi_links: UpiLinks | null;
}

export async function createSettlement(
  toUser: string,
  amount: number,
  groupId?: string,
) {
  return post<CreateSettlementResponse>("/settlements", {
    to_user: toUser,
    amount,
    ...(groupId !== undefined && { group_id: groupId }),
  });
}

export async function listSettlements() {
  const { settlements } = await get<{ settlements: Settlement[] }>(
    "/settlements",
  );
  return settlements;
}

export async function confirmSettlement(settlementId: string) {
  const { settlement } = await patch<{ settlement: Settlement }>(
    `/settlements/${settlementId}/confirm`,
    {},
  );
  return settlement;
}

export async function rejectSettlement(settlementId: string) {
  const { settlement } = await patch<{ settlement: Settlement }>(
    `/settlements/${settlementId}/reject`,
    {},
  );
  return settlement;
}

export async function addTxnRef(settlementId: string, upiTxnId: string) {
  const { settlement } = await patch<{ settlement: Settlement }>(
    `/settlements/${settlementId}/txn-ref`,
    { upi_txn_id: upiTxnId },
  );
  return settlement;
}
