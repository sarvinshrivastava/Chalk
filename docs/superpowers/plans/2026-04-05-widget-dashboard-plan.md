# Widget Dashboard + Mobile Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the empty Chalk dashboard with a customizable bento-grid widget system showing financial insights, charts, and group navigation — fixing mobile navigation in the process.

**Architecture:** Backend adds a `/dashboard` resource (layout CRUD + aggregated data endpoint) with Prisma. Frontend replaces the Dashboard page with a `@dnd-kit`-powered bento grid of `React.memo`-wrapped widget components rendered from a registry. Layout persists DB-first with localStorage cache. Mobile gets a hamburger drawer for sidebar access.

**Tech Stack:** React 19, TypeScript, Recharts, @dnd-kit/core + @dnd-kit/sortable, Express 5, Prisma 7, Zod, Vitest, Playwright

---

### Task 1: Prisma Schema Migration — `dashboard_layouts` table + `group_id` on settlements

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add `dashboard_layouts` model and `group_id` to `settlements`**

Add the new model and modify `settlements` + add relations to `users` and `groups`:

```prisma
/// Dashboard widget layout preferences per user
model dashboard_layouts {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id    String   @unique @db.Uuid
  layout     Json
  updated_at DateTime @default(now()) @db.Timestamptz(6)
  created_at DateTime @default(now()) @db.Timestamptz(6)

  users users @relation(fields: [user_id], references: [id], onDelete: Cascade)
}
```

In the existing `settlements` model, add after `deleted_at`:

```prisma
  group_id                           String?   @db.Uuid
  groups                             groups?   @relation(fields: [group_id], references: [id], onDelete: NoAction, onUpdate: NoAction)
```

In the `groups` model, add after `group_members`:

```prisma
  settlements   settlements[]
```

In the `users` model, add after `settlements_settlements_to_userTousers`:

```prisma
  dashboard_layouts                  dashboard_layouts?
```

- [ ] **Step 2: Generate migration and Prisma client**

Run:
```bash
cd backend && bunx prisma migrate dev --name add_dashboard_layouts_and_settlement_group_id
```
Expected: Migration created, client regenerated.

- [ ] **Step 3: Verify Prisma client types**

Run:
```bash
cd backend && bunx prisma generate
```
Expected: No errors. `dashboard_layouts` and `settlements.group_id` available in client.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/
git commit -m "feat(db): add dashboard_layouts table and group_id to settlements"
```

---

### Task 2: Backend — Dashboard Zod Schemas

**Files:**
- Create: `backend/src/schemas/dashboard.ts`

- [ ] **Step 1: Create dashboard validation schemas**

```typescript
import { z } from "zod";

export const WIDGET_TYPES = [
  "net-balance",
  "spending-by-group",
  "spending-pie",
  "top-debtor",
  "you-owe-most",
  "recent-expenses",
  "pending-settlements",
  "groups-list",
  "monthly-trend",
] as const;

const widgetInstanceSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(WIDGET_TYPES),
  position: z.object({
    x: z.number().int().min(0).max(2),
    y: z.number().int().min(0),
    w: z.number().int().min(1).max(3),
    h: z.number().int().min(1).max(3),
  }),
  config: z.record(z.union([z.string(), z.boolean()])),
});

export const dashboardLayoutSchema = z.object({
  layout: z.array(widgetInstanceSchema).max(20),
});

export type WidgetInstance = z.infer<typeof widgetInstanceSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/schemas/dashboard.ts
git commit -m "feat(backend): add dashboard Zod validation schemas"
```

---

### Task 3: Backend — Dashboard Service (Layout CRUD + Data Aggregation + Cache)

**Files:**
- Create: `backend/src/services/dashboard.ts`

- [ ] **Step 1: Create the dashboard service with default layout, cache, layout CRUD, and data aggregation**

```typescript
import { prisma } from "../lib/prisma.js";
import { AppError, withPrismaErrors } from "../lib/errors.js";
import type { WidgetInstance } from "../schemas/dashboard.js";

// ── Default layout for new users ──────────────────────────────────

export const DEFAULT_LAYOUT: WidgetInstance[] = [
  { id: crypto.randomUUID(), type: "net-balance", position: { x: 0, y: 0, w: 3, h: 1 }, config: {} },
  { id: crypto.randomUUID(), type: "spending-by-group", position: { x: 0, y: 1, w: 2, h: 2 }, config: { chartType: "bar" } },
  { id: crypto.randomUUID(), type: "top-debtor", position: { x: 2, y: 1, w: 1, h: 1 }, config: {} },
  { id: crypto.randomUUID(), type: "you-owe-most", position: { x: 2, y: 2, w: 1, h: 1 }, config: {} },
  { id: crypto.randomUUID(), type: "recent-expenses", position: { x: 0, y: 3, w: 2, h: 2 }, config: { count: "10" } },
  { id: crypto.randomUUID(), type: "groups-list", position: { x: 2, y: 3, w: 1, h: 2 }, config: {} },
];

// ── In-memory cache (15s TTL) ─────────────────────────────────────

interface CacheEntry {
  data: DashboardData;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15_000;

function getCached(userId: string): DashboardData | null {
  const entry = cache.get(userId);
  if (!entry || Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(userId);
    return null;
  }
  return entry.data;
}

export function invalidateDashboardCache(userId: string) {
  cache.delete(userId);
}

// ── Layout CRUD ───────────────────────────────────────────────────

export async function getLayout(userId: string) {
  const row = await prisma.dashboard_layouts.findUnique({
    where: { user_id: userId },
  });

  return {
    layout: row ? (row.layout as WidgetInstance[]) : DEFAULT_LAYOUT,
    updated_at: row?.updated_at ?? null,
  };
}

export async function saveLayout(userId: string, layout: WidgetInstance[]) {
  return withPrismaErrors(() =>
    prisma.dashboard_layouts.upsert({
      where: { user_id: userId },
      update: { layout: layout as unknown as Record<string, unknown>[], updated_at: new Date() },
      create: { user_id: userId, layout: layout as unknown as Record<string, unknown>[] },
    }),
  );
}

export async function resetLayout(userId: string) {
  await prisma.dashboard_layouts.deleteMany({
    where: { user_id: userId },
  });
}

// ── Data Aggregation ──────────────────────────────────────────────

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
  groups: { id: string; name: string; memberCount: number; yourBalance: number }[];
  monthlyTrend: { month: string; totalSpent: number }[];
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const cached = getCached(userId);
  if (cached) return cached;

  // 1. Get all groups the user belongs to
  const memberships = await prisma.group_members.findMany({
    where: { user_id: userId },
    select: { group_id: true },
  });
  const groupIds = memberships.map((m) => m.group_id);

  if (groupIds.length === 0) {
    const empty: DashboardData = {
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
    cache.set(userId, { data: empty, ts: Date.now() });
    return empty;
  }

  // 2. Parallel cross-group queries
  const [
    spendingAgg,
    recentExpensesRaw,
    pendingSettlementsRaw,
    groupsWithCount,
    monthlyTrendRaw,
    balanceData,
  ] = await Promise.all([
    // Spending by group
    prisma.expenses.groupBy({
      by: ["group_id"],
      _sum: { total_amount: true },
      where: { group_id: { in: groupIds }, deleted_at: null },
    }),

    // Recent expenses
    prisma.expenses.findMany({
      where: { group_id: { in: groupIds }, deleted_at: null },
      orderBy: { created_at: "desc" },
      take: 20,
      include: {
        users: { select: { name: true } },
        groups: { select: { name: true } },
      },
    }),

    // Pending settlements
    prisma.settlements.findMany({
      where: {
        OR: [{ from_user: userId }, { to_user: userId }],
        status: "pending",
        deleted_at: null,
      },
      include: {
        users_settlements_from_userTousers: { select: { id: true, name: true } },
        users_settlements_to_userTousers: { select: { id: true, name: true } },
        groups: { select: { id: true, name: true } },
      },
    }),

    // Groups with member count
    prisma.groups.findMany({
      where: { id: { in: groupIds }, deleted_at: null },
      include: { _count: { select: { group_members: true } } },
    }),

    // Monthly trend (last 12 months)
    prisma.$queryRaw<{ month: string; total: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', e.created_at), 'YYYY-MM') as month,
             COALESCE(SUM(es.amount_owed), 0) as total
      FROM expense_splits es
      JOIN expenses e ON e.id = es.expense_id
      WHERE es.user_id = ${userId}::uuid
        AND e.deleted_at IS NULL
        AND e.created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', e.created_at)
      ORDER BY month ASC
    `,

    // Cross-group net balance via raw SQL
    prisma.$queryRaw<{ other_user: string; other_name: string; net: bigint; group_id: string; group_name: string }[]>`
      WITH paid AS (
        SELECT e.group_id, g.name as group_name, es.user_id as other_user, u.name as other_name,
               SUM(es.amount_owed) as owed_to_me
        FROM expenses e
        JOIN expense_splits es ON es.expense_id = e.id
        JOIN groups g ON g.id = e.group_id
        JOIN users u ON u.id = es.user_id
        WHERE e.paid_by = ${userId}::uuid
          AND es.user_id != ${userId}::uuid
          AND e.deleted_at IS NULL
          AND e.group_id = ANY(${groupIds}::uuid[])
        GROUP BY e.group_id, g.name, es.user_id, u.name
      ),
      owed AS (
        SELECT e.group_id, g.name as group_name, e.paid_by as other_user, u.name as other_name,
               SUM(es.amount_owed) as i_owe
        FROM expenses e
        JOIN expense_splits es ON es.expense_id = e.id
        JOIN groups g ON g.id = e.group_id
        JOIN users u ON u.id = e.paid_by
        WHERE es.user_id = ${userId}::uuid
          AND e.paid_by != ${userId}::uuid
          AND e.deleted_at IS NULL
          AND e.group_id = ANY(${groupIds}::uuid[])
        GROUP BY e.group_id, g.name, e.paid_by, u.name
      ),
      settled AS (
        SELECT
          CASE WHEN from_user = ${userId}::uuid THEN to_user ELSE from_user END as other_user,
          SUM(CASE WHEN from_user = ${userId}::uuid THEN -amount ELSE amount END) as settlement_net
        FROM settlements
        WHERE (from_user = ${userId}::uuid OR to_user = ${userId}::uuid)
          AND status = 'confirmed'
          AND deleted_at IS NULL
        GROUP BY other_user
      )
      SELECT
        COALESCE(p.other_user, o.other_user) as other_user,
        COALESCE(p.other_name, o.other_name) as other_name,
        COALESCE(p.group_id, o.group_id) as group_id,
        COALESCE(p.group_name, o.group_name) as group_name,
        (COALESCE(p.owed_to_me, 0) - COALESCE(o.i_owe, 0) + COALESCE(s.settlement_net, 0)) as net
      FROM paid p
      FULL OUTER JOIN owed o ON p.other_user = o.other_user AND p.group_id = o.group_id
      LEFT JOIN settled s ON COALESCE(p.other_user, o.other_user) = s.other_user
      WHERE (COALESCE(p.owed_to_me, 0) - COALESCE(o.i_owe, 0) + COALESCE(s.settlement_net, 0)) != 0
    `,
  ]);

  // 3. Group name map for spending aggregation
  const groupNameMap = new Map(groupsWithCount.map((g) => [g.id, g.name]));

  // 4. Derive top-level stats from balance data
  let totalOwedToYou = 0;
  let totalYouOwe = 0;
  let topDebtor: DashboardData["topDebtor"] = null;
  let maxDebtorAmount = 0;

  const groupOwed = new Map<string, number>(); // groupId → how much I owe in this group

  for (const row of balanceData) {
    const net = Number(row.net);
    if (net > 0) {
      totalOwedToYou += net;
      if (net > maxDebtorAmount) {
        maxDebtorAmount = net;
        topDebtor = { userId: row.other_user, name: row.other_name, amount: net };
      }
    } else if (net < 0) {
      totalYouOwe += Math.abs(net);
      const prev = groupOwed.get(row.group_id) ?? 0;
      groupOwed.set(row.group_id, prev + Math.abs(net));
    }
  }

  let youOweMostIn: DashboardData["youOweMostIn"] = null;
  let maxGroupOwe = 0;
  for (const [gId, amount] of groupOwed) {
    if (amount > maxGroupOwe) {
      maxGroupOwe = amount;
      youOweMostIn = { groupId: gId, groupName: groupNameMap.get(gId) ?? "Unknown", amount };
    }
  }

  // 5. Compute per-group balance for groups list
  const groupBalanceMap = new Map<string, number>();
  for (const row of balanceData) {
    const net = Number(row.net);
    const prev = groupBalanceMap.get(row.group_id) ?? 0;
    groupBalanceMap.set(row.group_id, prev + net);
  }

  // 6. Shape final response
  const data: DashboardData = {
    totalOwedToYou,
    totalYouOwe,
    netBalance: totalOwedToYou - totalYouOwe,

    spendingByGroup: spendingAgg.map((s) => ({
      groupId: s.group_id,
      groupName: groupNameMap.get(s.group_id) ?? "Unknown",
      totalSpent: Number(s._sum.total_amount ?? 0),
    })),

    topDebtor,
    youOweMostIn,

    recentExpenses: recentExpensesRaw.map((e) => ({
      id: e.id,
      description: e.description,
      totalAmount: Number(e.total_amount),
      paidByName: e.users.name,
      groupName: e.groups.name,
      createdAt: e.created_at.toISOString(),
    })),

    pendingSettlements: pendingSettlementsRaw.map((s) => ({
      fromId: s.users_settlements_from_userTousers.id,
      fromName: s.users_settlements_from_userTousers.name,
      toId: s.users_settlements_to_userTousers.id,
      toName: s.users_settlements_to_userTousers.name,
      amount: Number(s.amount),
      groupId: s.groups?.id ?? null,
      groupName: s.groups?.name ?? null,
    })),

    groups: groupsWithCount.map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: g._count.group_members,
      yourBalance: groupBalanceMap.get(g.id) ?? 0,
    })),

    monthlyTrend: monthlyTrendRaw.map((m) => ({
      month: m.month,
      totalSpent: Number(m.total),
    })),
  };

  cache.set(userId, { data, ts: Date.now() });
  return data;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/dashboard.ts
git commit -m "feat(backend): add dashboard service with aggregation, cache, layout CRUD"
```

---

### Task 4: Backend — Dashboard Routes

**Files:**
- Create: `backend/src/routes/dashboard.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create dashboard router**

```typescript
import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { validate } from "../lib/validate.js";
import { asyncHandler } from "../lib/errors.js";
import { dashboardLayoutSchema } from "../schemas/dashboard.js";
import * as dashboardService from "../services/dashboard.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const result = await dashboardService.getLayout(userId);
    res.json(result);
  }),
);

router.put(
  "/",
  validate(dashboardLayoutSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    await dashboardService.saveLayout(userId, req.body.layout);
    res.json({ ok: true });
  }),
);

router.delete(
  "/",
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    await dashboardService.resetLayout(userId);
    res.json({ ok: true });
  }),
);

router.get(
  "/data",
  asyncHandler(async (req, res) => {
    const { userId } = req as AuthRequest;
    const data = await dashboardService.getDashboardData(userId);
    res.json(data);
  }),
);

export default router;
```

- [ ] **Step 2: Mount the router in index.ts**

In `backend/src/index.ts`, add after the settlements import:

```typescript
import dashboardRouter from "./routes/dashboard.js";
```

And after the settlements route mount:

```typescript
app.use("/dashboard", dashboardRouter);
```

- [ ] **Step 3: Verify server starts**

Run: `cd backend && bun run dev`
Expected: Server starts without errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/dashboard.ts backend/src/index.ts
git commit -m "feat(backend): add dashboard API routes"
```

---

### Task 5: Backend — Cache Invalidation in Mutation Services

**Files:**
- Modify: `backend/src/services/expenses.ts`
- Modify: `backend/src/services/settlements.ts`
- Modify: `backend/src/services/groups.ts`

- [ ] **Step 1: Add cache invalidation to expenses service**

At the top of `backend/src/services/expenses.ts`, add:

```typescript
import { invalidateDashboardCache } from "./dashboard.js";
```

At the end of the `createExpense` function (before return), add:

```typescript
invalidateDashboardCache(userId);
```

At the end of the `deleteExpense` function (before return), add:

```typescript
invalidateDashboardCache(userId);
```

- [ ] **Step 2: Add cache invalidation to settlements service**

At the top of `backend/src/services/settlements.ts`, add:

```typescript
import { invalidateDashboardCache } from "./dashboard.js";
```

At the end of the `createSettlement` function (before return), add:

```typescript
invalidateDashboardCache(userId);
```

At the end of `confirmSettlement` and `rejectSettlement` functions (before return), add:

```typescript
invalidateDashboardCache(userId);
```

- [ ] **Step 3: Update `createSettlement` to accept and store `group_id`**

Change the `createSettlement` function signature and data:

```typescript
export async function createSettlement(
  userId: string,
  toUser: string,
  amount: number,
  groupId?: string,
) {
```

In the `prisma.settlements.create` data, add:

```typescript
data: { from_user: userId, to_user: toUser, amount, status: "pending", ...(groupId && { group_id: groupId }) },
```

- [ ] **Step 4: Update settlement schema to accept `group_id`**

In `backend/src/schemas/settlements.ts` (or wherever the create settlement schema is), add `group_id` as optional:

```typescript
group_id: z.string().uuid().optional(),
```

- [ ] **Step 5: Update settlement route to pass `group_id`**

In the settlements route handler for POST, pass `req.body.group_id`:

```typescript
const result = await settlementsService.createSettlement(userId, req.body.to_user, req.body.amount, req.body.group_id);
```

- [ ] **Step 6: Add cache invalidation to groups service**

At the top of `backend/src/services/groups.ts`, add:

```typescript
import { invalidateDashboardCache } from "./dashboard.js";
```

At the end of `createGroup`, `deleteGroup`, and `leaveGroup` functions, add:

```typescript
invalidateDashboardCache(userId);
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/expenses.ts backend/src/services/settlements.ts backend/src/services/groups.ts backend/src/schemas/ backend/src/routes/settlements.ts
git commit -m "feat(backend): add cache invalidation + group_id to settlements"
```

---

### Task 6: Backend — Vitest Tests for Dashboard Endpoints

**Files:**
- Create: `backend/src/__tests__/dashboard.test.ts`

- [ ] **Step 1: Write dashboard API tests**

Follow the existing test patterns from `backend/src/__tests__/groups.test.ts`. Write tests for:

```typescript
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../index.js"; // or however the app is exported for tests
// Use the test setup from backend/src/__tests__/setup.ts

describe("Dashboard API", () => {
  describe("GET /dashboard", () => {
    it("returns default layout for new user", async () => {
      const res = await request(app)
        .get("/dashboard")
        .set("Authorization", `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(res.body.layout).toBeInstanceOf(Array);
      expect(res.body.layout.length).toBeGreaterThan(0);
      expect(res.body.layout[0]).toHaveProperty("type");
      expect(res.body.layout[0]).toHaveProperty("position");
    });
  });

  describe("PUT /dashboard", () => {
    it("saves and retrieves layout", async () => {
      const layout = [
        { id: crypto.randomUUID(), type: "net-balance", position: { x: 0, y: 0, w: 3, h: 1 }, config: {} },
      ];
      const putRes = await request(app)
        .put("/dashboard")
        .set("Authorization", `Bearer ${testToken}`)
        .send({ layout });
      expect(putRes.status).toBe(200);

      const getRes = await request(app)
        .get("/dashboard")
        .set("Authorization", `Bearer ${testToken}`);
      expect(getRes.body.layout).toHaveLength(1);
      expect(getRes.body.layout[0].type).toBe("net-balance");
    });

    it("rejects invalid widget types", async () => {
      const layout = [
        { id: crypto.randomUUID(), type: "invalid-widget", position: { x: 0, y: 0, w: 1, h: 1 }, config: {} },
      ];
      const res = await request(app)
        .put("/dashboard")
        .set("Authorization", `Bearer ${testToken}`)
        .send({ layout });
      expect(res.status).toBe(422);
    });

    it("rejects more than 20 widgets", async () => {
      const layout = Array.from({ length: 21 }, (_, i) => ({
        id: crypto.randomUUID(),
        type: "net-balance",
        position: { x: 0, y: i, w: 1, h: 1 },
        config: {},
      }));
      const res = await request(app)
        .put("/dashboard")
        .set("Authorization", `Bearer ${testToken}`)
        .send({ layout });
      expect(res.status).toBe(422);
    });
  });

  describe("DELETE /dashboard", () => {
    it("resets to default layout", async () => {
      // Save custom layout first
      await request(app)
        .put("/dashboard")
        .set("Authorization", `Bearer ${testToken}`)
        .send({ layout: [{ id: crypto.randomUUID(), type: "net-balance", position: { x: 0, y: 0, w: 1, h: 1 }, config: {} }] });

      // Delete
      const delRes = await request(app)
        .delete("/dashboard")
        .set("Authorization", `Bearer ${testToken}`);
      expect(delRes.status).toBe(200);

      // Should return default layout
      const getRes = await request(app)
        .get("/dashboard")
        .set("Authorization", `Bearer ${testToken}`);
      expect(getRes.body.layout.length).toBeGreaterThan(1); // default has 6 widgets
    });
  });

  describe("GET /dashboard/data", () => {
    it("returns correct shape with all fields", async () => {
      const res = await request(app)
        .get("/dashboard/data")
        .set("Authorization", `Bearer ${testToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalOwedToYou");
      expect(res.body).toHaveProperty("totalYouOwe");
      expect(res.body).toHaveProperty("netBalance");
      expect(res.body).toHaveProperty("spendingByGroup");
      expect(res.body).toHaveProperty("topDebtor");
      expect(res.body).toHaveProperty("youOweMostIn");
      expect(res.body).toHaveProperty("recentExpenses");
      expect(res.body).toHaveProperty("pendingSettlements");
      expect(res.body).toHaveProperty("groups");
      expect(res.body).toHaveProperty("monthlyTrend");
      // All monetary values should be numbers, not strings or BigInts
      expect(typeof res.body.totalOwedToYou).toBe("number");
      expect(typeof res.body.netBalance).toBe("number");
    });

    it("returns empty data for user with no groups", async () => {
      // Use a fresh user with no groups
      const res = await request(app)
        .get("/dashboard/data")
        .set("Authorization", `Bearer ${freshUserToken}`);
      expect(res.status).toBe(200);
      expect(res.body.groups).toEqual([]);
      expect(res.body.netBalance).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd backend && bun run test`
Expected: All dashboard tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/dashboard.test.ts
git commit -m "test(backend): add dashboard API tests"
```

---

### Task 7: Frontend — Install Dependencies + API Client Updates

**Files:**
- Modify: `web/package.json` (via bun add)
- Modify: `web/src/lib/api.ts`
- Create: `web/src/lib/services/dashboard.ts`

- [ ] **Step 1: Install frontend dependencies**

Run:
```bash
cd web && bun add recharts @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Add `put` to API client**

In `web/src/lib/api.ts`, add after the `patch` export:

```typescript
export const put = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body) });
```

- [ ] **Step 3: Create dashboard service**

```typescript
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
  groups: { id: string; name: string; memberCount: number; yourBalance: number }[];
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
```

- [ ] **Step 4: Commit**

```bash
git add web/package.json bun.lock web/src/lib/api.ts web/src/lib/services/dashboard.ts
git commit -m "feat(frontend): install deps + add dashboard API service"
```

---

### Task 8: Frontend — Widget Types + Registry + All 9 Widget Components

**Files:**
- Create: `web/src/components/dashboard/widgets/types.ts`
- Create: `web/src/components/dashboard/widgets/NetBalance.tsx`
- Create: `web/src/components/dashboard/widgets/SpendingByGroup.tsx`
- Create: `web/src/components/dashboard/widgets/SpendingPie.tsx`
- Create: `web/src/components/dashboard/widgets/TopDebtor.tsx`
- Create: `web/src/components/dashboard/widgets/YouOweMost.tsx`
- Create: `web/src/components/dashboard/widgets/RecentExpenses.tsx`
- Create: `web/src/components/dashboard/widgets/PendingSettlements.tsx`
- Create: `web/src/components/dashboard/widgets/GroupsList.tsx`
- Create: `web/src/components/dashboard/widgets/MonthlyTrend.tsx`
- Create: `web/src/components/dashboard/widgets/index.ts`

This is a large task. Each widget is a focused React component receiving `DashboardData` + `config`. All must be wrapped in `React.memo`.

- [ ] **Step 1: Create widget types**

File: `web/src/components/dashboard/widgets/types.ts`

```typescript
import type { DashboardData } from "../../../lib/services/dashboard";

export interface WidgetDefinition {
  type: string;
  name: string;
  description: string;
  defaultSize: { w: number; h: number };
  allowedSizes: { w: number; h: number }[];
  configurable?: WidgetConfigField[];
}

export interface WidgetConfigField {
  key: string;
  label: string;
  type: "select" | "toggle";
  options?: { value: string; label: string }[];
  default: string | boolean;
}

export interface WidgetProps {
  data: DashboardData;
  config: Record<string, string | boolean>;
}
```

- [ ] **Step 2: Create each widget component**

Each widget follows this pattern (showing NetBalance as example, implement all 9):

File: `web/src/components/dashboard/widgets/NetBalance.tsx`

```tsx
import { formatPaise } from "../../../lib/format";
import type { WidgetProps } from "./types";

function NetBalance({ data }: WidgetProps) {
  return (
    <div className="widget-net-balance">
      <div className="net-balance-stats">
        <div className="net-stat">
          <span className="net-stat-label">Owed to you</span>
          <span className="net-stat-value amount amount--positive">
            {formatPaise(data.totalOwedToYou)}
          </span>
        </div>
        <div className="net-stat">
          <span className="net-stat-label">You owe</span>
          <span className="net-stat-value amount amount--negative">
            {formatPaise(data.totalYouOwe)}
          </span>
        </div>
        <div className="net-stat">
          <span className="net-stat-label">Net</span>
          <span className={`net-stat-value amount ${data.netBalance >= 0 ? "amount--positive" : "amount--negative"}`}>
            {data.netBalance >= 0 ? "+" : ""}{formatPaise(Math.abs(data.netBalance))}
          </span>
        </div>
      </div>
    </div>
  );
}

export default NetBalance;
```

Implement similarly for: `SpendingByGroup` (Recharts `BarChart`), `SpendingPie` (Recharts `PieChart`), `TopDebtor`, `YouOweMost`, `RecentExpenses` (scrollable list), `PendingSettlements` (list with settle links), `GroupsList` (clickable `Link` to `/group/:id`), `MonthlyTrend` (Recharts `LineChart` or `AreaChart`).

- [ ] **Step 3: Create widget registry**

File: `web/src/components/dashboard/widgets/index.ts`

```typescript
import React from "react";
import type { WidgetDefinition, WidgetProps } from "./types";
import NetBalance from "./NetBalance";
import SpendingByGroup from "./SpendingByGroup";
import SpendingPie from "./SpendingPie";
import TopDebtor from "./TopDebtor";
import YouOweMost from "./YouOweMost";
import RecentExpenses from "./RecentExpenses";
import PendingSettlements from "./PendingSettlements";
import GroupsList from "./GroupsList";
import MonthlyTrend from "./MonthlyTrend";

interface RegistryEntry {
  component: React.MemoExoticType<React.ComponentType<WidgetProps>>;
  definition: WidgetDefinition;
}

export const WIDGET_REGISTRY: Record<string, RegistryEntry> = {
  "net-balance": {
    component: React.memo(NetBalance),
    definition: {
      type: "net-balance",
      name: "Net Balance",
      description: "Total owed to you, you owe, and net balance",
      defaultSize: { w: 3, h: 1 },
      allowedSizes: [{ w: 1, h: 1 }, { w: 2, h: 1 }, { w: 3, h: 1 }],
    },
  },
  "spending-by-group": {
    component: React.memo(SpendingByGroup),
    definition: {
      type: "spending-by-group",
      name: "Spending by Group",
      description: "Bar chart of spending across your groups",
      defaultSize: { w: 2, h: 2 },
      allowedSizes: [{ w: 2, h: 1 }, { w: 2, h: 2 }, { w: 3, h: 2 }],
      configurable: [
        { key: "chartType", label: "Chart type", type: "select", options: [{ value: "bar", label: "Bar" }, { value: "horizontal", label: "Horizontal Bar" }], default: "bar" },
      ],
    },
  },
  "spending-pie": {
    component: React.memo(SpendingPie),
    definition: {
      type: "spending-pie",
      name: "Spending Breakdown",
      description: "Pie chart of spending across groups",
      defaultSize: { w: 1, h: 2 },
      allowedSizes: [{ w: 1, h: 1 }, { w: 1, h: 2 }, { w: 2, h: 2 }],
      configurable: [
        { key: "chartType", label: "Chart type", type: "select", options: [{ value: "pie", label: "Pie" }, { value: "donut", label: "Donut" }], default: "pie" },
      ],
    },
  },
  "top-debtor": {
    component: React.memo(TopDebtor),
    definition: {
      type: "top-debtor",
      name: "Top Debtor",
      description: "Who owes you the most",
      defaultSize: { w: 1, h: 1 },
      allowedSizes: [{ w: 1, h: 1 }, { w: 2, h: 1 }],
    },
  },
  "you-owe-most": {
    component: React.memo(YouOweMost),
    definition: {
      type: "you-owe-most",
      name: "You Owe Most In",
      description: "Which group you owe the most in",
      defaultSize: { w: 1, h: 1 },
      allowedSizes: [{ w: 1, h: 1 }, { w: 2, h: 1 }],
    },
  },
  "recent-expenses": {
    component: React.memo(RecentExpenses),
    definition: {
      type: "recent-expenses",
      name: "Recent Expenses",
      description: "Latest expenses across all groups",
      defaultSize: { w: 2, h: 2 },
      allowedSizes: [{ w: 1, h: 2 }, { w: 2, h: 2 }, { w: 3, h: 2 }],
      configurable: [
        { key: "count", label: "Show", type: "select", options: [{ value: "5", label: "5 items" }, { value: "10", label: "10 items" }, { value: "20", label: "20 items" }], default: "10" },
      ],
    },
  },
  "pending-settlements": {
    component: React.memo(PendingSettlements),
    definition: {
      type: "pending-settlements",
      name: "Pending Settlements",
      description: "Debts waiting to be settled",
      defaultSize: { w: 2, h: 1 },
      allowedSizes: [{ w: 1, h: 1 }, { w: 2, h: 1 }],
    },
  },
  "groups-list": {
    component: React.memo(GroupsList),
    definition: {
      type: "groups-list",
      name: "Groups",
      description: "Your groups with balance indicators",
      defaultSize: { w: 1, h: 2 },
      allowedSizes: [{ w: 1, h: 1 }, { w: 1, h: 2 }, { w: 2, h: 2 }],
    },
  },
  "monthly-trend": {
    component: React.memo(MonthlyTrend),
    definition: {
      type: "monthly-trend",
      name: "Monthly Trend",
      description: "Spending trend over time",
      defaultSize: { w: 2, h: 1 },
      allowedSizes: [{ w: 2, h: 1 }, { w: 3, h: 1 }, { w: 3, h: 2 }],
      configurable: [
        { key: "period", label: "Period", type: "select", options: [{ value: "3", label: "3 months" }, { value: "6", label: "6 months" }, { value: "12", label: "12 months" }], default: "6" },
        { key: "chartType", label: "Chart type", type: "select", options: [{ value: "line", label: "Line" }, { value: "area", label: "Area" }], default: "line" },
      ],
    },
  },
};
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/dashboard/
git commit -m "feat(frontend): add widget types, 9 widget components, and registry"
```

---

### Task 9: Frontend — `useDashboard` Hook

**Files:**
- Create: `web/src/hooks/useDashboard.ts`

- [ ] **Step 1: Create the dashboard hook**

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchDashboardLayout,
  saveDashboardLayout,
  resetDashboardLayout,
  fetchDashboardData,
  type DashboardData,
  type WidgetInstance,
} from "../lib/services/dashboard";
import { getErrorMessage } from "../lib/format";

const LS_LAYOUT_KEY = "chalk-dashboard-layout";
const LS_SYNC_KEY = "chalk-dashboard-sync";
const DEBOUNCE_MS = 500;

function getLocalLayout(): WidgetInstance[] | null {
  try {
    const raw = localStorage.getItem(LS_LAYOUT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setLocalLayout(layout: WidgetInstance[]) {
  localStorage.setItem(LS_LAYOUT_KEY, JSON.stringify(layout));
}

function isSyncEnabled(): boolean {
  return localStorage.getItem(LS_SYNC_KEY) !== "false";
}

export function useDashboard() {
  const [layout, setLayout] = useState<WidgetInstance[]>(() => getLocalLayout() ?? []);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Fetch layout from DB and reconcile with localStorage
  const loadLayout = useCallback(async () => {
    if (!isSyncEnabled()) return;
    try {
      const remote = await fetchDashboardLayout();
      setLayout(remote.layout);
      setLocalLayout(remote.layout);
    } catch {
      // Use local layout as fallback
    }
  }, []);

  // Fetch widget data
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const result = await fetchDashboardData();
      setData(result);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLayout();
    loadData();
  }, [loadLayout, loadData]);

  // Persist layout changes (debounced to DB, immediate to localStorage)
  const updateLayout = useCallback((newLayout: WidgetInstance[]) => {
    setLayout(newLayout);
    setLocalLayout(newLayout);

    if (isSyncEnabled()) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveDashboardLayout(newLayout).catch(() => {});
      }, DEBOUNCE_MS);
    }
  }, []);

  const addWidget = useCallback(
    (instance: WidgetInstance) => {
      updateLayout([...layout, instance]);
    },
    [layout, updateLayout],
  );

  const removeWidget = useCallback(
    (widgetId: string) => {
      updateLayout(layout.filter((w) => w.id !== widgetId));
    },
    [layout, updateLayout],
  );

  const updateWidgetConfig = useCallback(
    (widgetId: string, config: Record<string, string | boolean>) => {
      updateLayout(layout.map((w) => (w.id === widgetId ? { ...w, config } : w)));
    },
    [layout, updateLayout],
  );

  const resetToDefault = useCallback(async () => {
    try {
      await resetDashboardLayout();
      localStorage.removeItem(LS_LAYOUT_KEY);
      const remote = await fetchDashboardLayout();
      setLayout(remote.layout);
      setLocalLayout(remote.layout);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }, []);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    loadData();
  }, [loadData]);

  return {
    layout,
    data,
    loading,
    error,
    updateLayout,
    addWidget,
    removeWidget,
    updateWidgetConfig,
    resetToDefault,
    retry,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/hooks/useDashboard.ts
git commit -m "feat(frontend): add useDashboard hook with layout CRUD + data fetching"
```

---

### Task 10: Frontend — BentoGrid + WidgetCard + WidgetPicker + WidgetSettings Components

**Files:**
- Create: `web/src/components/dashboard/BentoGrid.tsx`
- Create: `web/src/components/dashboard/BentoGrid.css`
- Create: `web/src/components/dashboard/WidgetCard.tsx`
- Create: `web/src/components/dashboard/WidgetCard.css`
- Create: `web/src/components/dashboard/WidgetPicker.tsx`
- Create: `web/src/components/dashboard/WidgetPicker.css`
- Create: `web/src/components/dashboard/WidgetSettings.tsx`

This is the core grid UI. The `BentoGrid` wraps `@dnd-kit` with a CSS Grid. `WidgetCard` renders each widget with edit-mode chrome. `WidgetPicker` is the slide-out panel. `WidgetSettings` is the per-widget config popover.

- [ ] **Step 1: Create BentoGrid component**

Implement using `DndContext` + `SortableContext` from `@dnd-kit`. Renders a CSS Grid with `grid-template-columns: repeat(cols, 1fr)` where `cols` comes from a `useBreakpoint()` check (3/2/1). Each widget is positioned via `grid-column` and `grid-row` spans derived from `WidgetInstance.position`.

- [ ] **Step 2: Create WidgetCard component**

A wrapper that renders the widget component from the registry inside a `.card` container. In edit mode, shows drag handle, resize handle, remove button, and settings button.

- [ ] **Step 3: Create WidgetPicker component**

Slide-out panel listing widgets from `WIDGET_REGISTRY` that aren't in the current layout. Each entry has name, description, and "Add" button.

- [ ] **Step 4: Create WidgetSettings component**

Popover anchored to a widget that renders its `configurable` fields as dropdowns/toggles.

- [ ] **Step 5: Add CSS for all dashboard components**

Style `BentoGrid.css`, `WidgetCard.css`, `WidgetPicker.css` using Chalk's design tokens (`--primary`, `--surface`, `--border`, `--radius`, etc.).

- [ ] **Step 6: Commit**

```bash
git add web/src/components/dashboard/
git commit -m "feat(frontend): add BentoGrid, WidgetCard, WidgetPicker, WidgetSettings"
```

---

### Task 11: Frontend — Rewrite Dashboard Page

**Files:**
- Modify: `web/src/pages/Dashboard.tsx`
- Modify: `web/src/pages/Dashboard.css`

- [ ] **Step 1: Rewrite Dashboard.tsx**

Replace the current placeholder with the widget grid:

```tsx
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useDashboard } from "../hooks/useDashboard";
import BentoGrid from "../components/dashboard/BentoGrid";
import WidgetPicker from "../components/dashboard/WidgetPicker";
import "./Dashboard.css";

export default function Dashboard() {
  const { user } = useAuth();
  const {
    layout,
    data,
    loading,
    error,
    updateLayout,
    addWidget,
    removeWidget,
    updateWidgetConfig,
    retry,
  } = useDashboard();
  const [editMode, setEditMode] = useState(false);

  // Zero-groups onboarding state
  if (!loading && data && data.groups.length === 0) {
    return (
      <div className="dashboard">
        <div className="dashboard-welcome">
          <h1>Welcome to ch<span className="logo-accent">a</span>lk</h1>
          <p className="dashboard-subtitle">
            {user?.email ? `Signed in as ${user.email}` : "Split expenses with friends, hassle-free."}
          </p>
        </div>
        <div className="dashboard-prompt card">
          <h2>Select a group to get started</h2>
          <p>Pick a group from the sidebar, or create a new one to begin tracking shared expenses.</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div className="dashboard">
        <div className="dashboard-error card">
          <h2>Failed to load dashboard</h2>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={retry}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <button
          className={`btn ${editMode ? "btn-primary" : "btn-outline"}`}
          onClick={() => setEditMode(!editMode)}
        >
          {editMode ? "Done" : "✏️ Edit"}
        </button>
      </div>

      {layout.length === 0 && (
        <div className="dashboard-empty card">
          <p>Your dashboard is empty. Click the edit button to add widgets.</p>
        </div>
      )}

      {data && (
        <BentoGrid
          layout={layout}
          data={data}
          editMode={editMode}
          onLayoutChange={updateLayout}
          onRemoveWidget={removeWidget}
          onUpdateConfig={updateWidgetConfig}
          loading={loading}
        />
      )}

      {editMode && (
        <WidgetPicker
          currentLayout={layout}
          onAddWidget={addWidget}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite Dashboard.css**

Style the dashboard header, error state, empty state, and overall grid container using Chalk design tokens.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Dashboard.tsx web/src/pages/Dashboard.css
git commit -m "feat(frontend): rewrite Dashboard page with widget grid"
```

---

### Task 12: Frontend — Mobile Hamburger Drawer

**Files:**
- Modify: `web/src/components/Layout.tsx`
- Modify: `web/src/components/Layout.css`

- [ ] **Step 1: Add hamburger state and drawer to Layout.tsx**

```tsx
import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import GroupsSidebar from "./GroupsSidebar";
import "./Layout.css";

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="desktop-shell">
      <header className="topbar">
        <button
          className="hamburger-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          ☰
        </button>
        <NavLink to="/" className="logo">
          ch<span className="logo-accent">a</span>lk
        </NavLink>
        {user && (
          <div className="topbar-actions">
            <span className="topbar-email">{user.email}</span>
            <button className="btn-ghost" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        )}
      </header>

      {/* Desktop static sidebar */}
      <aside className="sidebar">
        <GroupsSidebar />
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      )}
      <aside className={`drawer ${drawerOpen ? "drawer--open" : ""}`}>
        <GroupsSidebar />
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add drawer CSS to Layout.css**

Replace the existing `@media (max-width: 1023px)` block and add:

```css
/* Hamburger — hidden on desktop */
.hamburger-btn {
  display: none;
  background: none;
  border: none;
  font-size: 1.4rem;
  cursor: pointer;
  padding: 4px 8px;
  color: var(--ink);
}

/* Mobile drawer */
.drawer {
  display: none;
}

.drawer-backdrop {
  display: none;
}

@media (max-width: 1023px) {
  .desktop-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    display: none;
  }

  .hamburger-btn {
    display: block;
  }

  .content {
    grid-column: 1;
    padding: 20px;
  }

  /* Drawer overlay */
  .drawer-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 20;
  }

  .drawer {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: var(--sidebar-width);
    background: var(--white);
    border-right: 1px solid var(--border);
    z-index: 30;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    overflow-y: auto;
    padding-top: var(--header-height);
  }

  .drawer--open {
    transform: translateX(0);
  }
}
```

- [ ] **Step 3: Verify hamburger works at mobile viewport**

Open browser, resize below 1024px. Hamburger should appear, clicking opens drawer with groups list.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Layout.tsx web/src/components/Layout.css
git commit -m "feat(frontend): add mobile hamburger drawer for navigation"
```

---

### Task 13: Frontend — Lazy-Load Dashboard + Update Settlement Service

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/lib/services/settlements.ts`
- Modify: `web/src/pages/Settle.tsx`

- [ ] **Step 1: Lazy-load Dashboard in App.tsx**

Replace the Dashboard import:

```typescript
import { lazy, Suspense } from "react";
const Dashboard = lazy(() => import("./pages/Dashboard"));
```

And wrap the Dashboard route element:

```tsx
<Route path="/" element={<Suspense fallback={<div className="loading">Loading...</div>}><Dashboard /></Suspense>} />
```

- [ ] **Step 2: Update settlement service to pass `group_id`**

In `web/src/lib/services/settlements.ts`, update `createSettlement`:

```typescript
export async function createSettlement(toUser: string, amount: number, groupId?: string) {
  return post<CreateSettlementResponse>("/settlements", {
    to_user: toUser,
    amount,
    ...(groupId && { group_id: groupId }),
  });
}
```

- [ ] **Step 3: Pass `groupId` from Settle page**

In `web/src/pages/Settle.tsx`, update `handleSettle` to pass the `groupId` from `useParams`:

```typescript
const { upi_links } = await createSettlement(debt.to, debt.amount, groupId);
```

- [ ] **Step 4: Commit**

```bash
git add web/src/App.tsx web/src/lib/services/settlements.ts web/src/pages/Settle.tsx
git commit -m "feat(frontend): lazy-load dashboard + pass group_id on settlement"
```

---

### Task 14: Playwright E2E Tests — Dashboard + Mobile Nav

**Files:**
- Create: `e2e/dashboard-widgets.spec.ts`
- Create: `e2e/mobile-nav.spec.ts`

- [ ] **Step 1: Write dashboard widget E2E tests**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Widget Dashboard (authenticated)", () => {
  test("dashboard renders with widgets when user has groups", async ({ page }) => {
    await page.goto("/");
    // Should see dashboard header (not the old "Select a group" prompt if groups exist)
    await expect(page.locator(".dashboard")).toBeVisible({ timeout: 15_000 });
  });

  test("edit mode toggle shows edit controls", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".dashboard")).toBeVisible({ timeout: 15_000 });

    // Click edit button
    const editBtn = page.getByRole("button", { name: /Edit/ });
    await editBtn.click();

    // Should show "Done" button
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
  });

  test("layout persists after page refresh via localStorage", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".dashboard")).toBeVisible({ timeout: 15_000 });

    // Check localStorage has layout
    const hasLayout = await page.evaluate(() => {
      return localStorage.getItem("chalk-dashboard-layout") !== null;
    });
    expect(hasLayout).toBe(true);

    // Reload and verify dashboard still renders
    await page.reload();
    await expect(page.locator(".dashboard")).toBeVisible({ timeout: 15_000 });
  });
});
```

- [ ] **Step 2: Write mobile navigation E2E tests**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Mobile Navigation", () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone viewport

  test("hamburger button is visible on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".hamburger-btn")).toBeVisible({ timeout: 10_000 });
  });

  test("hamburger opens drawer with groups", async ({ page }) => {
    await page.goto("/");
    await page.locator(".hamburger-btn").click();

    // Drawer should be open
    await expect(page.locator(".drawer--open")).toBeVisible();

    // Should show groups sidebar content
    await expect(page.locator(".drawer .groups-sidebar")).toBeVisible();
  });

  test("clicking backdrop closes drawer", async ({ page }) => {
    await page.goto("/");
    await page.locator(".hamburger-btn").click();
    await expect(page.locator(".drawer--open")).toBeVisible();

    // Click backdrop
    await page.locator(".drawer-backdrop").click();
    await expect(page.locator(".drawer--open")).not.toBeVisible();
  });

  test("sidebar is hidden on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sidebar")).not.toBeVisible();
  });
});
```

- [ ] **Step 3: Run all Playwright tests**

Run: `bunx playwright test`
Expected: All new + existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/dashboard-widgets.spec.ts e2e/mobile-nav.spec.ts
git commit -m "test(e2e): add dashboard widget and mobile navigation tests"
```

---

## Task Summary

| Task | Description | Scope |
|------|-------------|-------|
| 1 | Prisma migration (dashboard_layouts + settlement group_id) | Backend/DB |
| 2 | Dashboard Zod schemas | Backend |
| 3 | Dashboard service (layout CRUD + aggregation + cache) | Backend |
| 4 | Dashboard routes + mount | Backend |
| 5 | Cache invalidation in mutation services + settlement group_id | Backend |
| 6 | Backend Vitest tests | Backend |
| 7 | Install deps + API client + dashboard service | Frontend |
| 8 | Widget types + 9 components + registry | Frontend |
| 9 | useDashboard hook | Frontend |
| 10 | BentoGrid + WidgetCard + WidgetPicker + WidgetSettings | Frontend |
| 11 | Rewrite Dashboard page | Frontend |
| 12 | Mobile hamburger drawer | Frontend |
| 13 | Lazy-load + settlement group_id passthrough | Frontend |
| 14 | Playwright E2E tests | Integration |

**Dependencies:** Tasks 1→2→3→4→5→6 (backend chain). Tasks 7→8→9→10→11 (frontend chain). Task 12 is independent. Task 13 depends on 8+11. Task 14 depends on all.
