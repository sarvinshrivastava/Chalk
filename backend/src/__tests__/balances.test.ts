import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../index.js";
import {
  mockPrisma,
  authenticateAs,
  AUTH_HEADER,
  TEST_USER_ID,
  TEST_USER_ID_2,
  TEST_GROUP_ID,
} from "./setup.js";

describe("Balances routes", () => {
  beforeEach(() => {
    authenticateAs(TEST_USER_ID);
  });

  // ── GET /balances/group/:groupId ────────────────────────────
  describe("GET /balances/group/:groupId", () => {
    it("returns balances and simplified debts", async () => {
      // requireGroupMembership
      mockPrisma.group_members.findUnique.mockResolvedValue({
        user_id: TEST_USER_ID,
      });

      // getGroupBalances queries
      mockPrisma.group_members.findMany.mockResolvedValue([
        {
          user_id: TEST_USER_ID,
          users: { id: TEST_USER_ID, name: "Alice", upi_id: "alice@upi" },
        },
        {
          user_id: TEST_USER_ID_2,
          users: { id: TEST_USER_ID_2, name: "Bob", upi_id: null },
        },
      ]);

      mockPrisma.expenses.findMany.mockResolvedValue([]);
      mockPrisma.expense_splits.findMany.mockResolvedValue([]);
      mockPrisma.settlements.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get(`/balances/group/${TEST_GROUP_ID}`)
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("balances");
      expect(res.body).toHaveProperty("debts");
    });

    it("returns 400 for invalid groupId", async () => {
      const res = await request(app)
        .get("/balances/group/not-a-uuid")
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid URL parameters");
    });

    it("returns 401 without auth header", async () => {
      const res = await request(app).get(`/balances/group/${TEST_GROUP_ID}`);

      expect(res.status).toBe(401);
    });
  });
});
