import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../index.js";

describe("GET /health", () => {
  it("returns status ok and service name", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "chalk-backend" });
  });
});
