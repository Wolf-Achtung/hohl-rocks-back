import { describe, it, expect, beforeAll, vi } from "vitest";

// Railway's private network is not up the instant the container starts, so
// a connection fired at import time hits DNS too early. That is not a TLS
// error, so the old code never retried and the in-memory fallback stuck for
// the whole process lifetime. Here the first two rounds fail with ENOTFOUND
// and the third succeeds.
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://postgres:geheim@postgres.railway.internal:5432/railway";
process.env.DB_SSL_REJECT_UNAUTHORIZED = "false";

const pools = [];
let failuresLeft = 2;

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
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        return Promise.reject(new Error(
          "getaddrinfo ENOTFOUND postgres.railway.internal " +
          "(postgresql://postgres:geheim@postgres.railway.internal:5432/railway)"
        ));
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    end() { return Promise.resolve(); }
  }
  return { default: { Pool } };
});

let db;

beforeAll(async () => {
  vi.useFakeTimers();
  db = await import("../src/config/database.js");
  // Drive the backoff: each round is one awaited timer plus microtasks
  for (let i = 0; i < 6; i++) {
    await vi.advanceTimersByTimeAsync(31000);
  }
  vi.useRealTimers();
});

describe("PostgreSQL connection retry", () => {
  it("keeps retrying a non-TLS failure until the network is up", () => {
    expect(db.isDbConnected()).toBe(true);
    // one pool per failed round plus the successful one - the old code
    // built exactly one and gave up
    expect(pools.length).toBeGreaterThanOrEqual(3);
  });

  it("reports the connection mode via getDbStatus", () => {
    expect(db.getDbStatus()).toMatch(/^connected/);
  });

  it("still writes votes through the connected pool", async () => {
    await db.recordBattleVote("gemini");
    const insert = pools
      .flatMap((p) => p.queries)
      .find((q) => q.sql.includes("INSERT INTO battle_votes"));
    expect(insert).toBeDefined();
    expect(insert.params).toEqual(["gemini"]);
  });
});
