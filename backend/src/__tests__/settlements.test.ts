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
  TEST_SETTLEMENT_ID,
} from "./setup.js";

describe("Settlements routes", () => {
  beforeEach(() => {
    authenticateAs(TEST_USER_ID);
  });

  // ── POST /settlements ───────────────────────────────────────
  describe("POST /settlements", () => {
    it("returns 201 on successful settlement creation", async () => {
      // adminClient: find payee
      mockAdminClient.single
        .mockResolvedValueOnce({
          data: { id: TEST_USER_ID_2, name: "Bob", upi_id: "bob@upi" },
          error: null,
        })
        // adminClient: insert settlement -> .select().single()
        .mockResolvedValueOnce({
          data: {
            id: TEST_SETTLEMENT_ID,
            from_user: TEST_USER_ID,
            to_user: TEST_USER_ID_2,
            amount: 5000,
            status: "pending",
          },
          error: null,
        });

      const res = await request(app)
        .post("/settlements")
        .set("Authorization", AUTH_HEADER)
        .send({ to_user: TEST_USER_ID_2, amount: 5000 });

      expect(res.status).toBe(201);
      expect(res.body.settlement).toBeDefined();
      expect(res.body.settlement.from_user).toBe(TEST_USER_ID);
      expect(res.body.settlement.to_user).toBe(TEST_USER_ID_2);
    });

    it("returns 400 for self-settlement", async () => {
      const res = await request(app)
        .post("/settlements")
        .set("Authorization", AUTH_HEADER)
        .send({ to_user: TEST_USER_ID, amount: 5000 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("SELF_SETTLEMENT");
    });

    it("returns 422 for invalid amount (negative)", async () => {
      const res = await request(app)
        .post("/settlements")
        .set("Authorization", AUTH_HEADER)
        .send({ to_user: TEST_USER_ID_2, amount: -100 });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 422 for non-integer amount", async () => {
      const res = await request(app)
        .post("/settlements")
        .set("Authorization", AUTH_HEADER)
        .send({ to_user: TEST_USER_ID_2, amount: 50.5 });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 422 for invalid to_user UUID", async () => {
      const res = await request(app)
        .post("/settlements")
        .set("Authorization", AUTH_HEADER)
        .send({ to_user: "not-a-uuid", amount: 5000 });

      expect(res.status).toBe(422);
    });
  });

  // ── PATCH /settlements/:id/confirm ──────────────────────────
  describe("PATCH /settlements/:settlementId/confirm", () => {
    it("returns 200 on successful confirmation", async () => {
      // fetchPendingSettlement via adminClient
      mockAdminClient.single
        .mockResolvedValueOnce({
          data: {
            id: TEST_SETTLEMENT_ID,
            from_user: TEST_USER_ID_2,
            to_user: TEST_USER_ID,
            status: "pending",
          },
          error: null,
        })
        // confirmSettlement update -> .select().single()
        .mockResolvedValueOnce({
          data: {
            id: TEST_SETTLEMENT_ID,
            status: "confirmed",
            paid_at: "2025-01-01T00:00:00Z",
          },
          error: null,
        });

      const res = await request(app)
        .patch(`/settlements/${TEST_SETTLEMENT_ID}/confirm`)
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.settlement.status).toBe("confirmed");
    });

    it("returns 403 when user is not the payee", async () => {
      // Settlement where current user is the payer, not the payee
      mockAdminClient.single.mockResolvedValueOnce({
        data: {
          id: TEST_SETTLEMENT_ID,
          from_user: TEST_USER_ID,
          to_user: TEST_USER_ID_2,
          status: "pending",
        },
        error: null,
      });

      const res = await request(app)
        .patch(`/settlements/${TEST_SETTLEMENT_ID}/confirm`)
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("NOT_PAYEE");
    });

    it("returns 409 when settlement is already confirmed", async () => {
      mockAdminClient.single.mockResolvedValueOnce({
        data: {
          id: TEST_SETTLEMENT_ID,
          from_user: TEST_USER_ID_2,
          to_user: TEST_USER_ID,
          status: "confirmed",
        },
        error: null,
      });

      const res = await request(app)
        .patch(`/settlements/${TEST_SETTLEMENT_ID}/confirm`)
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_STATUS");
    });
  });

  // ── PATCH /settlements/:id/reject ───────────────────────────
  describe("PATCH /settlements/:settlementId/reject", () => {
    it("returns 200 on successful rejection", async () => {
      mockAdminClient.single
        .mockResolvedValueOnce({
          data: {
            id: TEST_SETTLEMENT_ID,
            from_user: TEST_USER_ID_2,
            to_user: TEST_USER_ID,
            status: "pending",
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { id: TEST_SETTLEMENT_ID, status: "rejected" },
          error: null,
        });

      const res = await request(app)
        .patch(`/settlements/${TEST_SETTLEMENT_ID}/reject`)
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.settlement.status).toBe("rejected");
    });

    it("returns 403 when user is not the payee", async () => {
      mockAdminClient.single.mockResolvedValueOnce({
        data: {
          id: TEST_SETTLEMENT_ID,
          from_user: TEST_USER_ID,
          to_user: TEST_USER_ID_2,
          status: "pending",
        },
        error: null,
      });

      const res = await request(app)
        .patch(`/settlements/${TEST_SETTLEMENT_ID}/reject`)
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("NOT_PAYEE");
    });
  });

  // ── PATCH /settlements/:id/txn-ref ──────────────────────────
  describe("PATCH /settlements/:settlementId/txn-ref", () => {
    it("returns 200 on successful txn ref addition", async () => {
      mockAdminClient.single
        .mockResolvedValueOnce({
          data: {
            id: TEST_SETTLEMENT_ID,
            from_user: TEST_USER_ID,
            to_user: TEST_USER_ID_2,
            status: "pending",
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { id: TEST_SETTLEMENT_ID, upi_txn_id: "TXN123" },
          error: null,
        });

      const res = await request(app)
        .patch(`/settlements/${TEST_SETTLEMENT_ID}/txn-ref`)
        .set("Authorization", AUTH_HEADER)
        .send({ upi_txn_id: "TXN123" });

      expect(res.status).toBe(200);
      expect(res.body.settlement.upi_txn_id).toBe("TXN123");
    });

    it("returns 403 when user is not the payer", async () => {
      // Current user is the payee, not the payer
      mockAdminClient.single.mockResolvedValueOnce({
        data: {
          id: TEST_SETTLEMENT_ID,
          from_user: TEST_USER_ID_2,
          to_user: TEST_USER_ID,
          status: "pending",
        },
        error: null,
      });

      const res = await request(app)
        .patch(`/settlements/${TEST_SETTLEMENT_ID}/txn-ref`)
        .set("Authorization", AUTH_HEADER)
        .send({ upi_txn_id: "TXN123" });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("NOT_PAYER");
    });

    it("returns 422 when upi_txn_id is missing", async () => {
      const res = await request(app)
        .patch(`/settlements/${TEST_SETTLEMENT_ID}/txn-ref`)
        .set("Authorization", AUTH_HEADER)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });
  });

  // ── GET /settlements ────────────────────────────────────────
  describe("GET /settlements", () => {
    it("returns list of settlements", async () => {
      const fakeSettlements = [
        { id: TEST_SETTLEMENT_ID, from_user: TEST_USER_ID, amount: 5000 },
      ];
      mockUserClient.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: fakeSettlements, error: null });

      const res = await request(app)
        .get("/settlements")
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.settlements).toEqual(fakeSettlements);
    });

    it("returns 401 without auth header", async () => {
      const res = await request(app).get("/settlements");

      expect(res.status).toBe(401);
    });
  });
});
