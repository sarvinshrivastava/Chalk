import type { Paise } from "@chalk/shared";
import { get } from "../api";

export interface DebtEdge {
  from: string;
  to: string;
  amount: Paise;
  from_name: string;
  to_name: string;
  to_upi_id: string | null;
}

export interface BalancesResponse {
  balances: Record<string, Paise>;
  debts: DebtEdge[];
}

export async function fetchGroupBalances(groupId: string) {
  return get<BalancesResponse>(`/balances/group/${groupId}`);
}
