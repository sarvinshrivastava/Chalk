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
  TEST_EXPENSE_ID,
} from "./setup.js";

const validEqualExpense = {
  group_id: TEST_GROUP_ID,
  total_amount: 10000,
  description: "Dinner",
  split_type: "equal",
  split_with: [TEST_USER_ID, TEST_USER_ID_2],
};

describe("Expenses routes", () => {
  beforeEach(() => {
    authenticateAs(TEST_USER_ID);
  });

  // ── POST /expenses ──────────────────────────────────────────
  describe("POST /expenses", () => {
    it("returns 201 for equal split", async () => {
      // requireGroupMembership via userClient
      mockUserClient.maybeSingle.mockResolvedValue({
        data: { user_id: TEST_USER_ID },
        error: null,
      });

      // adminClient: check group members — thenable (no terminal)
      const memberData = [
        { user_id: TEST_USER_ID },
        { user_id: TEST_USER_ID_2 },
      ];
      mockAdminClient.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: memberData, error: null });

      // adminClient: insert expense -> .select().single()
      const fakeExpense = {
        id: TEST_EXPENSE_ID,
        ...validEqualExpense,
        paid_by: TEST_USER_ID,
      };
      mockAdminClient.single.mockResolvedValue({
        data: fakeExpense,
        error: null,
      });

      const res = await request(app)
        .post("/expenses")
        .set("Authorization", AUTH_HEADER)
        .send(validEqualExpense);

      expect(res.status).toBe(201);
      expect(res.body.expense).toEqual(fakeExpense);
      expect(res.body.splits).toBeDefined();
    });

    it("returns 201 for custom_percent split", async () => {
      mockUserClient.maybeSingle.mockResolvedValue({
        data: { user_id: TEST_USER_ID },
        error: null,
      });

      mockAdminClient.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data: [{ user_id: TEST_USER_ID }, { user_id: TEST_USER_ID_2 }],
          error: null,
        });

      const fakeExpense = { id: TEST_EXPENSE_ID, paid_by: TEST_USER_ID };
      mockAdminClient.single.mockResolvedValue({
        data: fakeExpense,
        error: null,
      });

      const res = await request(app)
        .post("/expenses")
        .set("Authorization", AUTH_HEADER)
        .send({
          group_id: TEST_GROUP_ID,
          total_amount: 10000,
          description: "Lunch",
          split_type: "custom_percent",
          percentages: {
            [TEST_USER_ID]: 60,
            [TEST_USER_ID_2]: 40,
          },
        });

      expect(res.status).toBe(201);
    });

    it("returns 201 for custom_amount split", async () => {
      mockUserClient.maybeSingle.mockResolvedValue({
        data: { user_id: TEST_USER_ID },
        error: null,
      });

      mockAdminClient.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data: [{ user_id: TEST_USER_ID }, { user_id: TEST_USER_ID_2 }],
          error: null,
        });

      const fakeExpense = { id: TEST_EXPENSE_ID, paid_by: TEST_USER_ID };
      mockAdminClient.single.mockResolvedValue({
        data: fakeExpense,
        error: null,
      });

      const res = await request(app)
        .post("/expenses")
        .set("Authorization", AUTH_HEADER)
        .send({
          group_id: TEST_GROUP_ID,
          total_amount: 10000,
          description: "Snacks",
          split_type: "custom_amount",
          amounts: {
            [TEST_USER_ID]: 7000,
            [TEST_USER_ID_2]: 3000,
          },
        });

      expect(res.status).toBe(201);
    });

    it("returns 422 when percentages do not sum to 100", async () => {
      const res = await request(app)
        .post("/expenses")
        .set("Authorization", AUTH_HEADER)
        .send({
          group_id: TEST_GROUP_ID,
          total_amount: 10000,
          description: "Bad split",
          split_type: "custom_percent",
          percentages: {
            [TEST_USER_ID]: 60,
            [TEST_USER_ID_2]: 30,
          },
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 422 when custom amounts do not sum to total", async () => {
      const res = await request(app)
        .post("/expenses")
        .set("Authorization", AUTH_HEADER)
        .send({
          group_id: TEST_GROUP_ID,
          total_amount: 10000,
          description: "Bad amounts",
          split_type: "custom_amount",
          amounts: {
            [TEST_USER_ID]: 5000,
            [TEST_USER_ID_2]: 3000,
          },
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 422 for negative amount", async () => {
      const res = await request(app)
        .post("/expenses")
        .set("Authorization", AUTH_HEADER)
        .send({
          group_id: TEST_GROUP_ID,
          total_amount: -500,
          description: "Negative",
          split_type: "equal",
          split_with: [TEST_USER_ID],
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });
  });

  // ── GET /expenses/group/:groupId ────────────────────────────
  describe("GET /expenses/group/:groupId", () => {
    it("returns list of expenses", async () => {
      const fakeExpenses = [
        { id: TEST_EXPENSE_ID, total_amount: 10000, description: "Dinner" },
      ];
      mockUserClient.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: fakeExpenses, error: null });

      const res = await request(app)
        .get(`/expenses/group/${TEST_GROUP_ID}`)
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.expenses).toEqual(fakeExpenses);
    });

    it("returns 400 for invalid groupId", async () => {
      const res = await request(app)
        .get("/expenses/group/not-a-uuid")
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(400);
    });
  });

  // ── GET /expenses/:expenseId ────────────────────────────────
  describe("GET /expenses/:expenseId", () => {
    it("returns a single expense", async () => {
      const fakeExpense = { id: TEST_EXPENSE_ID, total_amount: 10000 };
      mockUserClient.single.mockResolvedValue({
        data: fakeExpense,
        error: null,
      });

      const res = await request(app)
        .get(`/expenses/${TEST_EXPENSE_ID}`)
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.expense).toEqual(fakeExpense);
    });

    it("returns 400 for invalid expenseId", async () => {
      const res = await request(app)
        .get("/expenses/bad-id")
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /expenses/:expenseId ─────────────────────────────
  describe("DELETE /expenses/:expenseId", () => {
    it("returns 200 when payer deletes expense", async () => {
      // userClient: fetch expense to check paid_by
      mockUserClient.single.mockResolvedValue({
        data: { paid_by: TEST_USER_ID },
        error: null,
      });

      // adminClient: soft-delete update — thenable
      mockAdminClient.then = (resolve: (v: unknown) => unknown) =>
        resolve({ error: null });

      const res = await request(app)
        .delete(`/expenses/${TEST_EXPENSE_ID}`)
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("returns 403 when non-payer tries to delete", async () => {
      mockUserClient.single.mockResolvedValue({
        data: { paid_by: TEST_USER_ID_2 },
        error: null,
      });

      const res = await request(app)
        .delete(`/expenses/${TEST_EXPENSE_ID}`)
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("NOT_PAYER");
    });
  });
});
