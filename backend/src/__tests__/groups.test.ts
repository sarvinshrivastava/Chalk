import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../index.js";
import {
  mockPrisma,
  authenticateAs,
  AUTH_HEADER,
  TEST_USER_ID,
  TEST_GROUP_ID,
} from "./setup.js";

describe("Groups routes", () => {
  beforeEach(() => {
    authenticateAs(TEST_USER_ID);
  });

  // ── POST /groups ────────────────────────────────────────────
  describe("POST /groups", () => {
    it("returns 201 on successful group creation", async () => {
      const fakeGroup = {
        id: TEST_GROUP_ID,
        name: "Trip",
        created_by: TEST_USER_ID,
      };

      // $transaction executes callback; inside it calls groups.create and group_members.create
      mockPrisma.groups.create.mockResolvedValue(fakeGroup);
      mockPrisma.group_members.create.mockResolvedValue({});

      const res = await request(app)
        .post("/groups")
        .set("Authorization", AUTH_HEADER)
        .send({ name: "Trip" });

      expect(res.status).toBe(201);
      expect(res.body.group).toEqual(fakeGroup);
    });

    it("returns 422 when name is empty", async () => {
      const res = await request(app)
        .post("/groups")
        .set("Authorization", AUTH_HEADER)
        .send({ name: "" });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 422 when name is too long", async () => {
      const res = await request(app)
        .post("/groups")
        .set("Authorization", AUTH_HEADER)
        .send({ name: "A".repeat(51) });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 401 without auth header", async () => {
      const res = await request(app).post("/groups").send({ name: "Trip" });

      expect(res.status).toBe(401);
    });
  });

  // ── GET /groups ─────────────────────────────────────────────
  describe("GET /groups", () => {
    it("returns list of groups", async () => {
      mockPrisma.group_members.findMany.mockResolvedValue([
        {
          user_id: TEST_USER_ID,
          joined_at: "2025-01-01T00:00:00Z",
          groups: {
            id: TEST_GROUP_ID,
            name: "Trip",
            created_by: TEST_USER_ID,
            created_at: "2025-01-01",
          },
        },
      ]);

      const res = await request(app)
        .get("/groups")
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.groups).toEqual([
        {
          id: TEST_GROUP_ID,
          name: "Trip",
          created_by: TEST_USER_ID,
          created_at: "2025-01-01",
          joined_at: "2025-01-01T00:00:00Z",
        },
      ]);
    });
  });

  // ── GET /groups/:groupId ────────────────────────────────────
  describe("GET /groups/:groupId", () => {
    it("returns group detail", async () => {
      const fakeGroup = { id: TEST_GROUP_ID, name: "Trip" };

      // requireGroupMembership
      mockPrisma.group_members.findUnique.mockResolvedValue({
        user_id: TEST_USER_ID,
      });

      mockPrisma.groups.findUnique.mockResolvedValue(fakeGroup);
      mockPrisma.group_members.findMany.mockResolvedValue([
        {
          user_id: TEST_USER_ID,
          joined_at: "2025-01-01",
          users: { id: TEST_USER_ID, name: "User", upi_id: null },
        },
      ]);

      const res = await request(app)
        .get(`/groups/${TEST_GROUP_ID}`)
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.group).toEqual(fakeGroup);
      expect(res.body.members).toEqual([
        {
          id: TEST_USER_ID,
          name: "User",
          upi_id: null,
          joined_at: "2025-01-01",
        },
      ]);
    });

    it("returns 400 for invalid UUID", async () => {
      const res = await request(app)
        .get("/groups/not-a-uuid")
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid URL parameters");
    });
  });

  // ── POST /groups/:groupId/invite ────────────────────────────
  describe("POST /groups/:groupId/invite", () => {
    it("returns 201 on successful invite", async () => {
      const targetUserId = "00000000-0000-0000-0000-000000000099";

      // requireGroupMembership
      mockPrisma.group_members.findUnique
        .mockResolvedValueOnce({ user_id: TEST_USER_ID }) // membership check
        .mockResolvedValueOnce(null); // existing member check (not a member yet)

      // Find target user by phone
      mockPrisma.users.findFirst.mockResolvedValue({ id: targetUserId });

      // Count members
      mockPrisma.group_members.count.mockResolvedValue(2);

      // Create member
      mockPrisma.group_members.create.mockResolvedValue({});

      const res = await request(app)
        .post(`/groups/${TEST_GROUP_ID}/invite`)
        .set("Authorization", AUTH_HEADER)
        .send({ phone: "+919876543210" });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.user_id).toBe(targetUserId);
    });

    it("returns 422 for invalid phone number", async () => {
      const res = await request(app)
        .post(`/groups/${TEST_GROUP_ID}/invite`)
        .set("Authorization", AUTH_HEADER)
        .send({ phone: "abc" });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 409 when user is already a member", async () => {
      const targetUserId = "00000000-0000-0000-0000-000000000099";

      // requireGroupMembership
      mockPrisma.group_members.findUnique
        .mockResolvedValueOnce({ user_id: TEST_USER_ID }) // membership check
        .mockResolvedValueOnce({ user_id: targetUserId }); // existing member (already a member)

      mockPrisma.users.findFirst.mockResolvedValue({ id: targetUserId });
      mockPrisma.group_members.count.mockResolvedValue(2);

      const res = await request(app)
        .post(`/groups/${TEST_GROUP_ID}/invite`)
        .set("Authorization", AUTH_HEADER)
        .send({ phone: "+919876543210" });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ALREADY_MEMBER");
    });
  });

  // ── DELETE /groups/:groupId/leave ───────────────────────────
  describe("DELETE /groups/:groupId/leave", () => {
    it("returns 200 on successful leave", async () => {
      mockPrisma.group_members.delete.mockResolvedValue({});

      const res = await request(app)
        .delete(`/groups/${TEST_GROUP_ID}/leave`)
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── DELETE /groups/:groupId ─────────────────────────────────
  describe("DELETE /groups/:groupId", () => {
    it("returns 200 on successful delete", async () => {
      mockPrisma.groups.findUnique.mockResolvedValue({
        created_by: TEST_USER_ID,
      });
      mockPrisma.expense_splits.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.expenses.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.group_members.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.groups.delete.mockResolvedValue({});

      const res = await request(app)
        .delete(`/groups/${TEST_GROUP_ID}`)
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
