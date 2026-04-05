import { prisma } from "../lib/prisma.js";
import { withPrismaErrors } from "../lib/errors.js";
import type { WidgetInstance } from "../schemas/dashboard.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardData {
  totalOwedToYou: number;
  totalYouOwe: number;
  netBalance: number;
  spendingByGroup: { groupId: string; groupName: string; totalSpent: number }[];
  topDebtor: { userId: string; name: string; amount: number } | null;
  youOweMostIn: { groupId: string; groupName: string; amount: number } | null;
  recentExpenses: {
    id: string;
    groupId: string;
    groupName: string;
    description: string;
    totalAmount: number;
    paidBy: string;
    paidByName: string;
    createdAt: Date;
  }[];
  pendingSettlements: {
    id: string;
    fromUser: string;
    fromName: string;
    toUser: string;
    toName: string;
    amount: number;
    groupId: string | null;
    groupName: string | null;
    createdAt: Date;
  }[];
  groups: {
    id: string;
    name: string;
    memberCount: number;
    yourBalance: number;
  }[];
  monthlyTrend: { month: string; total: number }[];
}

// ---------------------------------------------------------------------------
// Default layout
// ---------------------------------------------------------------------------

export const DEFAULT_LAYOUT: WidgetInstance[] = [
  {
    id: "00000000-0000-4000-a000-000000000001",
    type: "net-balance",
    position: { x: 0, y: 0, w: 3, h: 1 },
    config: {},
  },
  {
    id: "00000000-0000-4000-a000-000000000002",
    type: "spending-by-group",
    position: { x: 0, y: 1, w: 2, h: 2 },
    config: {},
  },
  {
    id: "00000000-0000-4000-a000-000000000003",
    type: "top-debtor",
    position: { x: 2, y: 1, w: 1, h: 1 },
    config: {},
  },
  {
    id: "00000000-0000-4000-a000-000000000004",
    type: "you-owe-most",
    position: { x: 2, y: 2, w: 1, h: 1 },
    config: {},
  },
  {
    id: "00000000-0000-4000-a000-000000000005",
    type: "recent-expenses",
    position: { x: 0, y: 3, w: 2, h: 2 },
    config: {},
  },
  {
    id: "00000000-0000-4000-a000-000000000006",
    type: "groups-list",
    position: { x: 2, y: 3, w: 1, h: 2 },
    config: {},
  },
];

// ---------------------------------------------------------------------------
// In-memory cache (15s TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 15_000;

const cache = new Map<string, { data: DashboardData; ts: number }>();

export function invalidateDashboardCache(userId: string): void {
  cache.delete(userId);
}

// ---------------------------------------------------------------------------
// Layout CRUD
// ---------------------------------------------------------------------------

export async function getLayout(userId: string): Promise<WidgetInstance[]> {
  const row = await prisma.dashboard_layouts.findUnique({
    where: { user_id: userId },
  });

  if (!row) return DEFAULT_LAYOUT;

  return row.layout as unknown as WidgetInstance[];
}

export async function saveLayout(
  userId: string,
  layout: WidgetInstance[],
): Promise<void> {
  await withPrismaErrors(() =>
    prisma.dashboard_layouts.upsert({
      where: { user_id: userId },
      update: {
        layout: JSON.parse(JSON.stringify(layout)),
        updated_at: new Date(),
      },
      create: { user_id: userId, layout: JSON.parse(JSON.stringify(layout)) },
    }),
  );
}

export async function resetLayout(userId: string): Promise<void> {
  // Delete silently — if no row exists, that's fine (user already on defaults)
  await prisma.dashboard_layouts
    .delete({ where: { user_id: userId } })
    .catch(() => {
      // P2025: record not found — ignore
    });
}

// ---------------------------------------------------------------------------
// Data aggregation
// ---------------------------------------------------------------------------

export async function getDashboardData(userId: string): Promise<DashboardData> {
  // Check cache
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  // Get user's group IDs
  const memberships = await prisma.group_members.findMany({
    where: { user_id: userId },
    select: { group_id: true },
  });
  const groupIds = memberships.map((m) => m.group_id);

  // If user has no groups, return empty dashboard
  if (groupIds.length === 0) {
    const emptyData: DashboardData = {
      totalOwedToYou: 0,
      totalYouOwe: 0,
      netBalance: 0,
      spendingByGroup: [],
      topDebtor: null,
      youOweMostIn: null,
      recentExpenses: [],
      pendingSettlements: [],
      groups: [],
      monthlyTrend: [],
    };
    cache.set(userId, { data: emptyData, ts: Date.now() });
    return emptyData;
  }

  // Run parallel queries
  const [
    spendingByGroupRaw,
    recentExpensesRaw,
    pendingSettlementsRaw,
    groupsRaw,
    monthlyTrendRaw,
    netBalanceRows,
  ] = await Promise.all([
    // 1. Spending by group (total of expenses user paid in each group)
    prisma.expenses.groupBy({
      by: ["group_id"],
      where: {
        group_id: { in: groupIds },
        paid_by: userId,
        deleted_at: null,
      },
      _sum: { total_amount: true },
    }),

    // 2. Recent expenses across all groups
    prisma.expenses.findMany({
      where: {
        group_id: { in: groupIds },
        deleted_at: null,
      },
      orderBy: { created_at: "desc" },
      take: 20,
      include: {
        groups: { select: { name: true } },
        users: { select: { name: true } },
      },
    }),

    // 3. Pending settlements involving the user
    prisma.settlements.findMany({
      where: {
        OR: [{ from_user: userId }, { to_user: userId }],
        status: "pending",
        deleted_at: null,
      },
      include: {
        users_settlements_from_userTousers: { select: { name: true } },
        users_settlements_to_userTousers: { select: { name: true } },
        groups: { select: { id: true, name: true } },
      },
      orderBy: { created_at: "desc" },
    }),

    // 4. Groups with member count
    prisma.groups.findMany({
      where: { id: { in: groupIds } },
      include: {
        _count: { select: { group_members: true } },
      },
    }),

    // 5. Monthly trend (last 12 months) — user's paid expenses
    prisma.$queryRaw<{ month: string; total: bigint }[]>`
      SELECT
        to_char(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
        COALESCE(SUM(total_amount), 0) AS total
      FROM expenses
      WHERE paid_by = ${userId}::uuid
        AND group_id = ANY(${groupIds}::uuid[])
        AND deleted_at IS NULL
        AND created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at) ASC
    `,

    // 6. Cross-group net balances via raw SQL
    // Positive = others owe user, Negative = user owes others
    prisma.$queryRaw<{ other_user: string; other_name: string; net: bigint }[]>`
      WITH
        paid AS (
          SELECT e.paid_by AS payer, es.user_id AS debtor, SUM(es.amount_owed) AS amt
          FROM expenses e
          JOIN expense_splits es ON es.expense_id = e.id
          WHERE e.group_id = ANY(${groupIds}::uuid[])
            AND e.deleted_at IS NULL
            AND e.paid_by != es.user_id
          GROUP BY e.paid_by, es.user_id
        ),
        settled AS (
          SELECT from_user, to_user, SUM(amount) AS amt
          FROM settlements
          WHERE status = 'confirmed'
            AND deleted_at IS NULL
            AND (from_user = ${userId}::uuid OR to_user = ${userId}::uuid)
          GROUP BY from_user, to_user
        )
      SELECT
        u.id AS other_user,
        u.name AS other_name,
        (
          COALESCE((SELECT SUM(p.amt) FROM paid p WHERE p.payer = ${userId}::uuid AND p.debtor = u.id), 0)
          - COALESCE((SELECT SUM(p.amt) FROM paid p WHERE p.payer = u.id AND p.debtor = ${userId}::uuid), 0)
          - COALESCE((SELECT SUM(s.amt) FROM settled s WHERE s.from_user = u.id AND s.to_user = ${userId}::uuid), 0)
          + COALESCE((SELECT SUM(s.amt) FROM settled s WHERE s.from_user = ${userId}::uuid AND s.to_user = u.id), 0)
        ) AS net
      FROM users u
      WHERE u.id != ${userId}::uuid
        AND u.deleted_at IS NULL
      HAVING (
          COALESCE((SELECT SUM(p.amt) FROM paid p WHERE p.payer = ${userId}::uuid AND p.debtor = u.id), 0)
          - COALESCE((SELECT SUM(p.amt) FROM paid p WHERE p.payer = u.id AND p.debtor = ${userId}::uuid), 0)
          - COALESCE((SELECT SUM(s.amt) FROM settled s WHERE s.from_user = u.id AND s.to_user = ${userId}::uuid), 0)
          + COALESCE((SELECT SUM(s.amt) FROM settled s WHERE s.from_user = ${userId}::uuid AND s.to_user = u.id), 0)
        ) != 0
    `,
  ]);

  // ---------------------------------------------------------------------------
  // Build group name map
  // ---------------------------------------------------------------------------
  const groupNameMap = new Map<string, string>();
  for (const g of groupsRaw) {
    groupNameMap.set(g.id, g.name);
  }

  // ---------------------------------------------------------------------------
  // Spending by group
  // ---------------------------------------------------------------------------
  const spendingByGroup = spendingByGroupRaw.map((row) => ({
    groupId: row.group_id,
    groupName: groupNameMap.get(row.group_id) ?? "Unknown",
    totalSpent: Number(row._sum.total_amount ?? 0),
  }));

  // ---------------------------------------------------------------------------
  // Net balance aggregation
  // ---------------------------------------------------------------------------
  let totalOwedToYou = 0;
  let totalYouOwe = 0;

  let topDebtorEntry: { userId: string; name: string; amount: number } | null =
    null;

  for (const row of netBalanceRows) {
    const net = Number(row.net);
    if (net > 0) {
      // This person owes the user
      totalOwedToYou += net;
      if (!topDebtorEntry || net > topDebtorEntry.amount) {
        topDebtorEntry = {
          userId: row.other_user,
          name: row.other_name,
          amount: net,
        };
      }
    } else if (net < 0) {
      totalYouOwe += Math.abs(net);
    }
  }

  // ---------------------------------------------------------------------------
  // "You owe most in" — group where user's net debt is largest
  // ---------------------------------------------------------------------------
  // Compute per-group balance for the user from expense splits
  const perGroupDebt = new Map<string, number>();

  // For each group, compute: sum of what user was paid for - sum of user's splits + settlements
  // Simplified: use spending-by-group data minus user's own splits in each group
  // Actually, let's compute from the raw expense data already fetched
  // We'll do a simpler approach: for each group, sum user's splits (what they owe) minus what they paid
  const groupExpenseMap = new Map<
    string,
    { paidByUser: number; userSplits: number }
  >();

  // Get user's splits across all groups
  const userSplits = await prisma.expense_splits.findMany({
    where: {
      user_id: userId,
      expenses: {
        group_id: { in: groupIds },
        deleted_at: null,
      },
    },
    include: {
      expenses: { select: { group_id: true, paid_by: true } },
    },
  });

  for (const split of userSplits) {
    const gId = split.expenses.group_id;
    const existing = groupExpenseMap.get(gId) ?? {
      paidByUser: 0,
      userSplits: 0,
    };
    existing.userSplits += Number(split.amount_owed);
    if (split.expenses.paid_by === userId) {
      existing.paidByUser += Number(split.amount_owed);
    }
    groupExpenseMap.set(gId, existing);
  }

  // Add what user paid (total) per group from spendingByGroup
  for (const sg of spendingByGroup) {
    const existing = groupExpenseMap.get(sg.groupId) ?? {
      paidByUser: 0,
      userSplits: 0,
    };
    // paidByUser here means total the user paid in this group
    // userSplits is what the user owes across all expenses in this group
    // Net debt in group = userSplits - paidByUser (positive means user owes)
    // But we already counted the user's own split in paidByUser above,
    // so we need: userSplits - sg.totalSpent (total amount user paid for)
    perGroupDebt.set(sg.groupId, existing.userSplits - sg.totalSpent);
  }

  // Also handle groups where user didn't pay anything but has splits
  for (const [gId, data] of groupExpenseMap) {
    if (!perGroupDebt.has(gId)) {
      perGroupDebt.set(gId, data.userSplits - data.paidByUser);
    }
  }

  let youOweMostIn: {
    groupId: string;
    groupName: string;
    amount: number;
  } | null = null;

  for (const [gId, debt] of perGroupDebt) {
    if (debt > 0 && (!youOweMostIn || debt > youOweMostIn.amount)) {
      youOweMostIn = {
        groupId: gId,
        groupName: groupNameMap.get(gId) ?? "Unknown",
        amount: debt,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Recent expenses
  // ---------------------------------------------------------------------------
  const recentExpenses = recentExpensesRaw.map((e) => ({
    id: e.id,
    groupId: e.group_id,
    groupName: e.groups.name,
    description: e.description,
    totalAmount: Number(e.total_amount),
    paidBy: e.paid_by,
    paidByName: e.users.name,
    createdAt: e.created_at,
  }));

  // ---------------------------------------------------------------------------
  // Pending settlements
  // ---------------------------------------------------------------------------
  const pendingSettlements = pendingSettlementsRaw.map((s) => ({
    id: s.id,
    fromUser: s.from_user,
    fromName: s.users_settlements_from_userTousers.name,
    toUser: s.to_user,
    toName: s.users_settlements_to_userTousers.name,
    amount: Number(s.amount),
    groupId: s.groups?.id ?? null,
    groupName: s.groups?.name ?? null,
    createdAt: s.created_at,
  }));

  // ---------------------------------------------------------------------------
  // Groups with member count and user's balance
  // ---------------------------------------------------------------------------
  const groups = groupsRaw.map((g) => ({
    id: g.id,
    name: g.name,
    memberCount: g._count.group_members,
    yourBalance: -(perGroupDebt.get(g.id) ?? 0), // Positive = you're owed, negative = you owe
  }));

  // ---------------------------------------------------------------------------
  // Monthly trend
  // ---------------------------------------------------------------------------
  const monthlyTrend = monthlyTrendRaw.map((row) => ({
    month: row.month,
    total: Number(row.total),
  }));

  // ---------------------------------------------------------------------------
  // Assemble & cache
  // ---------------------------------------------------------------------------
  const data: DashboardData = {
    totalOwedToYou,
    totalYouOwe,
    netBalance: totalOwedToYou - totalYouOwe,
    spendingByGroup,
    topDebtor: topDebtorEntry,
    youOweMostIn,
    recentExpenses,
    pendingSettlements,
    groups,
    monthlyTrend,
  };

  cache.set(userId, { data, ts: Date.now() });

  return data;
}
