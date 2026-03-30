/** All monetary values are in paise (1 INR = 100 paise). Never use floats. */
export type Paise = number;

export interface User {
  id: string;
  name: string;
  upi_id: string | null;
  phone: string | null;
  auth_provider: "google" | "apple" | "email";
}

export interface Group {
  id: string;
  name: string;
  created_by: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  joined_at: string;
}

export type SplitType = "equal" | "by_item" | "custom_percent" | "custom_amount";

export interface Expense {
  id: string;
  group_id: string;
  paid_by: string;
  total_amount: Paise;
  description: string;
  bill_image_url: string | null;
  split_type: SplitType;
  created_at: string;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  amount_owed: Paise;
}

export type SettlementStatus = "pending" | "confirmed" | "rejected";

export interface Settlement {
  id: string;
  from_user: string;
  to_user: string;
  amount: Paise;
  upi_txn_id: string | null;
  status: SettlementStatus;
  paid_at: string | null;
}

export interface PersonalTally {
  id: string;
  user_id: string;
  category: string;
  amount: Paise;
  month: string; // YYYY-MM
}
