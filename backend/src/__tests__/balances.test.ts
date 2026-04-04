import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../index.js";
import {
  mockUserClient,
  mockAdminClient,
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
      // The service does multiple queries via Promise.all.
      // userClient queries: group_members, expenses, expense_splits (all thenable)
      // adminClient query: settlements (thenable)

      // First call: group_members select — thenable
      // Because multiple queries chain through the same mock, we configure
      // the thenable to return members data for the first resolution.
      const membersData = [
        {
          user_id: TEST_USER_ID,
          users: { id: TEST_USER_ID, name: "Alice", upi_id: "alice@upi" },
        },
        {
          user_id: TEST_USER_ID_2,
          users: { id: TEST_USER_ID_2, name: "Bob", upi_id: null },
        },
      ];

      // Since all queries go through the same chain mock and resolve via .then,
      // we need them all to succeed. The simplest approach: make the thenable
      // return empty arrays for expenses/splits so balances are all zero.
      mockUserClient.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: membersData, error: null });

      // adminClient thenable for settlements query
      mockAdminClient.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: [], error: null });

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
