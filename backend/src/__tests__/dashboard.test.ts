import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../index.js";
import {
  mockPrisma,
  authenticateAs,
  AUTH_HEADER,
  TEST_USER_ID,
  TEST_GROUP_ID,
} from "./setup.js";

// ---------------------------------------------------------------------------
// Augment mockPrisma with dashboard-specific methods not in setup.ts
// We extend the existing mock object without touching setup.ts.
// ---------------------------------------------------------------------------

const mockDashboardLayouts = {
  findUnique: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
};

beforeAll(() => {
  // Attach dashboard_layouts model mock
  Object.assign(mockPrisma, { dashboard_layouts: mockDashboardLayouts });

  // Attach $queryRaw (used by getDashboardData for monthly trend + net balances)
  Object.assign(mockPrisma, { $queryRaw: vi.fn() });

  // Attach groupBy to expenses model (used by getDashboardData)
  Object.assign(mockPrisma.expenses, { groupBy: vi.fn() });
});

// ---------------------------------------------------------------------------
// Valid widget for reuse across tests
// ---------------------------------------------------------------------------

const validWidget = {
  id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  type: "net-balance",
  position: { x: 0, y: 0, w: 2, h: 1 },
  config: {},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed all Prisma mocks needed for a successful getDashboardData call. */
function seedDashboardDataMocks(groupIds: string[]) {
  // group_members.findMany → memberships
  mockPrisma.group_members.findMany.mockResolvedValue(
    groupIds.map((id) => ({ group_id: id })),
  );

  // expenses.groupBy → spendingByGroup
  (
    mockPrisma.expenses as typeof mockPrisma.expenses & {
      groupBy: ReturnType<typeof vi.fn>;
    }
  ).groupBy.mockResolvedValue([]);

  // expenses.findMany → recentExpenses
  mockPrisma.expenses.findMany.mockResolvedValue([]);

  // settlements.findMany → pendingSettlements
  mockPrisma.settlements.findMany.mockResolvedValue([]);

  // groups.findMany → groupsRaw
  mockPrisma.groups.findMany.mockResolvedValue(
    groupIds.map((id) => ({
      id,
      name: "Test Group",
      _count: { group_members: 2 },
    })),
  );

  // expense_splits.findMany → userSplits
  mockPrisma.expense_splits.findMany.mockResolvedValue([]);

  // $queryRaw → called twice: monthlyTrend, netBalanceRows
  (
    mockPrisma as typeof mockPrisma & { $queryRaw: ReturnType<typeof vi.fn> }
  ).$queryRaw
    .mockResolvedValueOnce([]) // monthly trend
    .mockResolvedValueOnce([]); // net balance rows
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Dashboard routes", () => {
  beforeEach(() => {
    authenticateAs(TEST_USER_ID);

    // Reset the augmented mocks (setup.ts beforeEach resets the original ones)
    mockDashboardLayouts.findUnique.mockReset();
    mockDashboardLayouts.upsert.mockReset();
    mockDashboardLayouts.delete.mockReset();
    (
      mockPrisma as typeof mockPrisma & { $queryRaw: ReturnType<typeof vi.fn> }
    ).$queryRaw?.mockReset();
    (
      mockPrisma.expenses as typeof mockPrisma.expenses & {
        groupBy: ReturnType<typeof vi.fn>;
      }
    ).groupBy?.mockReset();
  });

  // ── GET /dashboard ───────────────────────────────────────────
  describe("GET /dashboard", () => {
    it("returns 200 with default layout when no saved layout exists", async () => {
      mockDashboardLayouts.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get("/dashboard")
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.layout)).toBe(true);
      expect(res.body.layout.length).toBeGreaterThan(0);

      // Each widget must have the required shape
      for (const widget of res.body.layout) {
        expect(widget).toHaveProperty("id");
        expect(widget).toHaveProperty("type");
        expect(widget).toHaveProperty("position");
        expect(widget).toHaveProperty("config");
        expect(typeof widget.position.x).toBe("number");
        expect(typeof widget.position.y).toBe("number");
        expect(typeof widget.position.w).toBe("number");
        expect(typeof widget.position.h).toBe("number");
      }
    });

    it("returns 200 with saved layout when one exists", async () => {
      const savedLayout = [validWidget];
      mockDashboardLayouts.findUnique.mockResolvedValue({
        user_id: TEST_USER_ID,
        layout: savedLayout,
      });

      const res = await request(app)
        .get("/dashboard")
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.layout).toEqual(savedLayout);
    });

    it("returns 401 without auth header", async () => {
      const res = await request(app).get("/dashboard");

      expect(res.status).toBe(401);
    });
  });

  // ── PUT /dashboard ───────────────────────────────────────────
  describe("PUT /dashboard", () => {
    it("saves layout and returns ok: true", async () => {
      mockDashboardLayouts.upsert.mockResolvedValue({});

      const res = await request(app)
        .put("/dashboard")
        .set("Authorization", AUTH_HEADER)
        .send({ layout: [validWidget] });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("saves layout and subsequent GET returns it", async () => {
      const layout = [validWidget];

      // PUT — save it
      mockDashboardLayouts.upsert.mockResolvedValue({});
      const putRes = await request(app)
        .put("/dashboard")
        .set("Authorization", AUTH_HEADER)
        .send({ layout });

      expect(putRes.status).toBe(200);
      expect(putRes.body.ok).toBe(true);

      // GET — retrieve it
      mockDashboardLayouts.findUnique.mockResolvedValue({
        user_id: TEST_USER_ID,
        layout,
      });
      const getRes = await request(app)
        .get("/dashboard")
        .set("Authorization", AUTH_HEADER);

      expect(getRes.status).toBe(200);
      expect(getRes.body.layout).toEqual(layout);
    });

    it("rejects an invalid widget type with 422", async () => {
      const res = await request(app)
        .put("/dashboard")
        .set("Authorization", AUTH_HEADER)
        .send({
          layout: [
            {
              ...validWidget,
              type: "invalid-widget-type",
            },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });

    it("rejects more than 20 widgets with 422", async () => {
      const layout = Array.from({ length: 21 }, (_, i) => ({
        ...validWidget,
        id: `aaaaaaaa-aaaa-4aaa-aaaa-${String(i).padStart(12, "0")}`,
      }));

      const res = await request(app)
        .put("/dashboard")
        .set("Authorization", AUTH_HEADER)
        .send({ layout });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });

    it("rejects missing layout field with 422", async () => {
      const res = await request(app)
        .put("/dashboard")
        .set("Authorization", AUTH_HEADER)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 401 without auth header", async () => {
      const res = await request(app)
        .put("/dashboard")
        .send({ layout: [validWidget] });

      expect(res.status).toBe(401);
    });
  });

  // ── DELETE /dashboard ────────────────────────────────────────
  describe("DELETE /dashboard", () => {
    it("resets layout and returns ok: true", async () => {
      mockDashboardLayouts.delete.mockResolvedValue({});

      const res = await request(app)
        .delete("/dashboard")
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("still returns ok: true when no layout row exists (idempotent)", async () => {
      // delete throws P2025-style error — service catches it silently
      mockDashboardLayouts.delete.mockRejectedValue(
        Object.assign(new Error("Record not found"), { code: "P2025" }),
      );

      const res = await request(app)
        .delete("/dashboard")
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("returns 401 without auth header", async () => {
      const res = await request(app).delete("/dashboard");

      expect(res.status).toBe(401);
    });
  });

  // ── GET /dashboard/data ──────────────────────────────────────
  describe("GET /dashboard/data", () => {
    it("returns 200 with empty data for a user with no groups", async () => {
      // No memberships → empty dashboard
      mockPrisma.group_members.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get("/dashboard/data")
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.netBalance).toBe(0);
      expect(res.body.groups).toEqual([]);
      expect(res.body.recentExpenses).toEqual([]);
      expect(res.body.pendingSettlements).toEqual([]);
      expect(res.body.spendingByGroup).toEqual([]);
      expect(res.body.monthlyTrend).toEqual([]);
      expect(res.body.topDebtor).toBeNull();
      expect(res.body.youOweMostIn).toBeNull();
    });

    it("returns 200 with correct shape when user has groups", async () => {
      seedDashboardDataMocks([TEST_GROUP_ID]);

      const res = await request(app)
        .get("/dashboard/data")
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);

      // All top-level fields must be present
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

      // Monetary fields must be JS numbers (not strings or objects from BigInt)
      expect(typeof res.body.totalOwedToYou).toBe("number");
      expect(typeof res.body.totalYouOwe).toBe("number");
      expect(typeof res.body.netBalance).toBe("number");

      // Groups array has the correct per-group shape
      expect(Array.isArray(res.body.groups)).toBe(true);
      if (res.body.groups.length > 0) {
        const g = res.body.groups[0];
        expect(g).toHaveProperty("id");
        expect(g).toHaveProperty("name");
        expect(typeof g.memberCount).toBe("number");
        expect(typeof g.yourBalance).toBe("number");
      }
    });

    it("coerces BigInt monetary values to plain numbers", async () => {
      // Seed with raw BigInt-like values from $queryRaw (Prisma returns BigInt for numeric aggregates)
      mockPrisma.group_members.findMany.mockResolvedValue([
        { group_id: TEST_GROUP_ID },
      ]);
      (
        mockPrisma.expenses as typeof mockPrisma.expenses & {
          groupBy: ReturnType<typeof vi.fn>;
        }
      ).groupBy.mockResolvedValue([
        { group_id: TEST_GROUP_ID, _sum: { total_amount: BigInt(5000) } },
      ]);
      mockPrisma.expenses.findMany.mockResolvedValue([]);
      mockPrisma.settlements.findMany.mockResolvedValue([]);
      mockPrisma.groups.findMany.mockResolvedValue([
        {
          id: TEST_GROUP_ID,
          name: "Trip",
          _count: { group_members: 3 },
        },
      ]);
      mockPrisma.expense_splits.findMany.mockResolvedValue([]);
      (
        mockPrisma as typeof mockPrisma & {
          $queryRaw: ReturnType<typeof vi.fn>;
        }
      ).$queryRaw
        .mockResolvedValueOnce([{ month: "2025-01", total: BigInt(5000) }]) // monthly trend
        .mockResolvedValueOnce([]); // net balance rows

      const res = await request(app)
        .get("/dashboard/data")
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      // JSON.stringify(BigInt) throws — if we get a 200, serialization succeeded
      // Verify the monthly trend total is a plain number
      if (res.body.monthlyTrend.length > 0) {
        expect(typeof res.body.monthlyTrend[0].total).toBe("number");
      }
      if (res.body.spendingByGroup.length > 0) {
        expect(typeof res.body.spendingByGroup[0].totalSpent).toBe("number");
      }
    });

    it("returns 401 without auth header", async () => {
      const res = await request(app).get("/dashboard/data");

      expect(res.status).toBe(401);
    });
  });
});
