import { describe, it, expect, beforeAll, vi } from "vitest";

// The exact production scenario: DATABASE_URL points at Railway's internal
// network, which speaks no TLS - the first (TLS) attempt fails with the
// classic pg error and the code must retry without TLS instead of dropping
// to the in-memory fallback.
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://postgres:pw@postgres.railway.internal:5432/railway";
process.env.DB_SSL_REJECT_UNAUTHORIZED = "true";

const pools = [];

vi.mock("pg", () => {
  class Pool {
    constructor(opts) {
      this.opts = opts;
      this.queries = [];
      pools.push(this);
    }
    on() {}
    query(sql, params) {
      this.queries.push({ sql, params });
      if (this.opts.ssl) {
        return Promise.reject(new Error("The server does not support SSL connections"));
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    end() { return Promise.resolve(); }
  }
  return { default: { Pool } };
});

let db;

beforeAll(async () => {
  db = await import("../src/config/database.js");
  // module-level connect runs async - give it a beat
  await new Promise((resolve) => setTimeout(resolve, 50));
});

describe("PostgreSQL TLS fallback", () => {
  it("retries without TLS when the server refuses SSL and ends up connected", () => {
    expect(db.isDbConnected()).toBe(true);
    expect(pools.length).toBe(2);
    expect(pools[0].opts.ssl).toEqual({ rejectUnauthorized: true });
    expect(pools[1].opts.ssl).toBe(false);
  });

  it("creates the battle_votes table alongside chat_logs", () => {
    const ddl = pools[1].queries.map((q) => q.sql).join("\n");
    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS chat_logs");
    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS battle_votes");
  });

  it("writes votes through the pool once connected", async () => {
    await db.recordBattleVote("claude");
    const insert = pools[1].queries.find((q) => q.sql.includes("INSERT INTO battle_votes"));
    expect(insert).toBeDefined();
    expect(insert.params).toEqual(["claude"]);
  });
});
