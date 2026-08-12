import { describe, it, expect, beforeAll, vi } from "vitest";

// Permanent failure: every attempt fails with an error that carries the
// connection string. /health must show WHY without ever showing the password.
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://postgres:supergeheim@postgres.railway.internal:5432/railway";
process.env.DB_SSL_REJECT_UNAUTHORIZED = "true";

vi.mock("pg", () => {
  class Pool {
    constructor(opts) { this.opts = opts; }
    on() {}
    query() {
      return Promise.reject(new Error(
        "connect ECONNREFUSED - postgresql://postgres:supergeheim@postgres.railway.internal:5432/railway"
      ));
    }
    end() { return Promise.resolve(); }
  }
  return { default: { Pool } };
});

let db;

beforeAll(async () => {
  vi.useFakeTimers();
  db = await import("../src/config/database.js");
  for (let i = 0; i < 8; i++) {
    await vi.advanceTimersByTimeAsync(31000);
  }
  vi.useRealTimers();
});

describe("PostgreSQL permanent failure", () => {
  it("gives up into the in-memory fallback instead of hanging", () => {
    expect(db.isDbConnected()).toBe(false);
  });

  it("says why, so the reason is visible in /health", () => {
    expect(db.getDbStatus()).toMatch(/^failed:/);
    expect(db.getDbStatus()).toContain("ECONNREFUSED");
  });

  it("redacts the credentials out of the reason", () => {
    const status = db.getDbStatus();
    expect(status).not.toContain("supergeheim");
    expect(status).toContain("postgres://<redacted>");
  });

  it("still records votes in memory so the site keeps working", async () => {
    await db.recordBattleVote("claude");
    await db.recordBattleVote("claude");
    await db.recordBattleVote("gpt");
    const { counts, total } = await db.getBattleVotes();
    expect(total).toBe(3);
    expect(counts.claude).toBe(2);
  });
});
