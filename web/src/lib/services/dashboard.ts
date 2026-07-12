import { get, put, del } from "../api";

export interface DashboardData {
  totalOwedToYou: number;
  totalYouOwe: number;
  netBalance: number;
  spendingByGroup: { groupId: string; groupName: string; totalSpent: number }[];
  topDebtor: { userId: string; name: string; amount: number } | null;
  youOweMostIn: { groupId: string; groupName: string; amount: number } | null;
  recentExpenses: {
    id: string;
    description: string;
    totalAmount: number;
    paidByName: string;
    groupName: string;
    createdAt: string;
  }[];
  pendingSettlements: {
    fromId: string;
    fromName: string;
    toId: string;
    toName: string;
    amount: number;
    groupId: string | null;
    groupName: string | null;
  }[];
  groups: {
    id: string;
    name: string;
    memberCount: number;
    yourBalance: number;
  }[];
  monthlyTrend: { month: string; totalSpent: number }[];
}

export interface WidgetInstance {
  id: string;
  type: string;
  position: { x: number; y: number; w: number; h: number };
  config: Record<string, string | boolean>;
}

interface LayoutResponse {
  layout: WidgetInstance[];
  updated_at: string | null;
}

export async function fetchDashboardLayout() {
  return get<LayoutResponse>("/dashboard");
}

export async function saveDashboardLayout(layout: WidgetInstance[]) {
  return put<{ ok: true }>("/dashboard", { layout });
}

export async function resetDashboardLayout() {
  return del<{ ok: true }>("/dashboard");
}

export async function fetchDashboardData() {
  return get<DashboardData>("/dashboard/data");
}
