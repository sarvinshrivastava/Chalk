import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../index.js";
import {
  mockPrisma,
  mockAdminClientAuth,
  mockUserClientAuth,
  authenticateAs,
  AUTH_HEADER,
  TEST_USER_ID,
} from "./setup.js";

describe("Auth routes", () => {
  // ── POST /auth/signup/email ─────────────────────────────────
  describe("POST /auth/signup/email", () => {
    it("returns 201 on successful signup", async () => {
      const fakeUser = { id: TEST_USER_ID, email: "new@test.com" };
      const fakeSession = { access_token: "tok", refresh_token: "ref" };

      mockAdminClientAuth.signUp.mockResolvedValue({
        data: { user: fakeUser, session: fakeSession },
        error: null,
      });

      // Prisma upsert for user row
      mockPrisma.users.upsert.mockResolvedValue({});

      const res = await request(app).post("/auth/signup/email").send({
        email: "new@test.com",
        password: "password123",
        name: "Test User",
      });

      expect(res.status).toBe(201);
      expect(res.body.user).toEqual(fakeUser);
      expect(res.body.session).toEqual(fakeSession);
    });

    it("returns 422 when email is missing", async () => {
      const res = await request(app).post("/auth/signup/email").send({
        password: "password123",
        name: "Test User",
      });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 422 when email is invalid", async () => {
      const res = await request(app).post("/auth/signup/email").send({
        email: "not-an-email",
        password: "password123",
        name: "Test User",
      });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
      expect(res.body.fields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "email" })]),
      );
    });

    it("returns 422 when password is too short", async () => {
      const res = await request(app).post("/auth/signup/email").send({
        email: "valid@test.com",
        password: "short",
        name: "Test User",
      });

      expect(res.status).toBe(422);
      expect(res.body.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "password" }),
        ]),
      );
    });

    it("returns 422 when name is missing", async () => {
      const res = await request(app).post("/auth/signup/email").send({
        email: "valid@test.com",
        password: "password123",
      });

      expect(res.status).toBe(422);
    });
  });

  // ── POST /auth/signin/email ─────────────────────────────────
  describe("POST /auth/signin/email", () => {
    it("returns 200 on successful signin", async () => {
      const fakeUser = { id: TEST_USER_ID, email: "user@test.com" };
      const fakeSession = { access_token: "tok" };

      mockAdminClientAuth.signInWithPassword.mockResolvedValue({
        data: { user: fakeUser, session: fakeSession },
        error: null,
      });

      const res = await request(app).post("/auth/signin/email").send({
        email: "user@test.com",
        password: "password123",
      });

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual(fakeUser);
    });

    it("returns 401 on wrong password", async () => {
      mockAdminClientAuth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "Invalid login credentials" },
      });

      const res = await request(app).post("/auth/signin/email").send({
        email: "user@test.com",
        password: "wrongpassword",
      });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("SIGNIN_FAILED");
    });
  });

  // ── POST /auth/signin/oauth ─────────────────────────────────
  describe("POST /auth/signin/oauth", () => {
    it("returns 200 on successful OAuth signin", async () => {
      const fakeUser = {
        id: TEST_USER_ID,
        email: "oauth@test.com",
        user_metadata: { full_name: "OAuth User" },
      };

      // signInWithOAuth uses createUserClient(access_token) then getUser
      mockUserClientAuth.getUser.mockResolvedValue({
        data: { user: fakeUser },
        error: null,
      });

      // Prisma upsert
      mockPrisma.users.upsert.mockResolvedValue({});

      const res = await request(app).post("/auth/signin/oauth").send({
        access_token: "valid-oauth-token",
        provider: "google",
        name: "OAuth User",
      });

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual(fakeUser);
    });

    it("returns 401 on invalid OAuth token", async () => {
      mockUserClientAuth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid token" },
      });

      const res = await request(app).post("/auth/signin/oauth").send({
        access_token: "invalid-token",
        provider: "google",
      });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("OAUTH_INVALID");
    });

    it("returns 422 on invalid provider", async () => {
      const res = await request(app).post("/auth/signin/oauth").send({
        access_token: "some-token",
        provider: "facebook",
      });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });
  });

  // ── POST /auth/refresh ──────────────────────────────────────
  describe("POST /auth/refresh", () => {
    it("returns 200 on successful refresh", async () => {
      const fakeSession = { access_token: "new-tok", refresh_token: "new-ref" };

      mockAdminClientAuth.refreshSession.mockResolvedValue({
        data: { session: fakeSession },
        error: null,
      });

      const res = await request(app).post("/auth/refresh").send({
        refresh_token: "valid-refresh-token",
      });

      expect(res.status).toBe(200);
      expect(res.body.session).toEqual(fakeSession);
    });

    it("returns 422 when refresh_token is missing", async () => {
      const res = await request(app).post("/auth/refresh").send({});

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });
  });

  // ── GET /auth/me ────────────────────────────────────────────
  describe("GET /auth/me", () => {
    it("returns user profile when authenticated", async () => {
      authenticateAs(TEST_USER_ID);

      const fakeProfile = { id: TEST_USER_ID, name: "Test User", upi_id: null };
      mockPrisma.users.findUnique.mockResolvedValue(fakeProfile);

      const res = await request(app)
        .get("/auth/me")
        .set("Authorization", AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual(fakeProfile);
    });

    it("returns 401 when Authorization header is missing", async () => {
      const res = await request(app).get("/auth/me");

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("AUTH_MISSING");
    });
  });

  // ── PATCH /auth/me ──────────────────────────────────────────
  describe("PATCH /auth/me", () => {
    beforeEach(() => {
      authenticateAs(TEST_USER_ID);
    });

    it("updates name successfully", async () => {
      const updated = { id: TEST_USER_ID, name: "New Name", upi_id: null };
      mockPrisma.users.update.mockResolvedValue(updated);

      const res = await request(app)
        .patch("/auth/me")
        .set("Authorization", AUTH_HEADER)
        .send({ name: "New Name" });

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual(updated);
    });

    it("returns 422 for invalid UPI VPA", async () => {
      const res = await request(app)
        .patch("/auth/me")
        .set("Authorization", AUTH_HEADER)
        .send({ upi_id: "not a valid vpa" });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 422 when no fields are provided", async () => {
      const res = await request(app)
        .patch("/auth/me")
        .set("Authorization", AUTH_HEADER)
        .send({});

      expect(res.status).toBe(422);
    });
  });
});
