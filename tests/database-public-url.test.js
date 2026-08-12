import { describe, it, expect, beforeAll, vi } from "vitest";

// The live failure: DATABASE_URL points at a private hostname that does not
// resolve in this project (getaddrinfo ENOTFOUND ...). Railway hands out a
// public URL for exactly that case - the connection must fall over to it
// instead of losing the database for the whole process lifetime.
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://postgres:pw@postgres-_hao.railway.internal:5432/railway";
process.env.DATABASE_PUBLIC_URL = "postgresql://postgres:pw@yamabiko.proxy.rlwy.net:41234/railway";
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
      if (this.opts.connectionString.includes("railway.internal")) {
        return Promise.reject(new Error("getaddrinfo ENOTFOUND postgres-_hao.railway.internal"));
      }
      if (this.opts.ssl && this.opts.ssl.rejectUnauthorized) {
        return Promise.reject(new Error("self signed certificate in certificate chain"));
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
  await vi.advanceTimersByTimeAsync(1000);
  vi.useRealTimers();
});

describe("DATABASE_PUBLIC_URL fallback", () => {
  it("connects over the public address when the private hostname does not resolve", () => {
    expect(db.isDbConnected()).toBe(true);
  });

  it("tries the private address first - it costs no egress", () => {
    expect(pools[0].opts.connectionString).toContain("railway.internal");
  });

  it("reports which address and TLS mode won", () => {
    // The public proxy presents a self-signed cert, so the strict attempt
    // fails and the no-TLS retry carries it.
    expect(db.getDbStatus()).toBe("connected (public, no TLS)");
  });

  it("does not retry the private address without TLS - ENOTFOUND is not a TLS problem", () => {
    const privatePools = pools.filter((p) => p.opts.connectionString.includes("railway.internal"));
    expect(privatePools).toHaveLength(1);
  });

  it("writes to the public connection", async () => {
    await db.recordBattleVote("perplexity");
    const insert = pools
      .flatMap((p) => p.queries)
      .find((q) => q.sql.includes("INSERT INTO battle_votes"));
    expect(insert.params).toEqual(["perplexity"]);
  });
});
