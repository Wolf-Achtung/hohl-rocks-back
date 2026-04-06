import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../src/app.js";

let server;
let baseUrl;

beforeAll(async () => {
  server = app.listen(0); // Random port
  const address = server.address();
  baseUrl = `http://localhost:${address.port}`;
});

afterAll(async () => {
  server?.close();
});

describe("Health Endpoints", () => {
  it("GET / returns ok status", async () => {
    const res = await fetch(`${baseUrl}/`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.version).toBe("2.8.0");
  });

  it("GET /health returns detailed health", async () => {
    const res = await fetch(`${baseUrl}/health`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(data.checks.api).toBe("ok");
    expect(data.checks.rateLimiting).toBe("active");
  });

  it("GET /healthz returns liveness probe", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
  });

  it("GET /readyz returns readiness probe", async () => {
    const res = await fetch(`${baseUrl}/readyz`);
    expect(res.status).toBe(200);
  });
});

describe("Security Headers", () => {
  it("returns security headers", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-xss-protection")).toBe("1; mode=block");
  });
});

describe("Prompt Library", () => {
  it("GET /api/prompts returns paginated prompts", async () => {
    const res = await fetch(`${baseUrl}/api/prompts?limit=5`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.count).toBeLessThanOrEqual(5);
    expect(data.pagination).toBeDefined();
  });

  it("GET /api/prompts filters by category", async () => {
    const res = await fetch(`${baseUrl}/api/prompts?category=creative`);
    const data = await res.json();
    expect(data.prompts.every(p => p.category === "creative")).toBe(true);
  });

  it("GET /api/prompts/:id returns single prompt", async () => {
    const res = await fetch(`${baseUrl}/api/prompts/1`);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.prompt.id).toBe(1);
  });

  it("GET /api/prompts/:id returns 404 for missing", async () => {
    const res = await fetch(`${baseUrl}/api/prompts/9999`);
    expect(res.status).toBe(404);
  });
});

describe("Model Battle", () => {
  it("POST /api/model-battle validates input", async () => {
    const res = await fetch(`${baseUrl}/api/model-battle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/model-battle rejects too-long prompts", async () => {
    const res = await fetch(`${baseUrl}/api/model-battle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "x".repeat(2001) })
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Prompt too long");
  });

  it("POST /api/model-battle returns structured response (graceful degradation)", async () => {
    const res = await fetch(`${baseUrl}/api/model-battle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "test prompt" })
    });
    const data = await res.json();
    expect(data.responses).toHaveLength(4);
    expect(data.meta.totalModels).toBe(4);
    // Without API keys, all models should report "not configured"
    data.responses.forEach(r => {
      expect(r.model).toBeDefined();
      expect(r.name).toBeDefined();
      expect(typeof r.responseTime).toBe("number");
    });
  });
});

describe("Content Endpoints", () => {
  it("GET /api/news returns news items", async () => {
    const res = await fetch(`${baseUrl}/api/news`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
  });

  it("GET /api/spark/today returns spark", async () => {
    const res = await fetch(`${baseUrl}/api/spark/today`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.spark).toBeDefined();
    expect(data.author).toBe("hohl.rocks");
  });
});

describe("Error Handling", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Not found");
    expect(data.availableRoutes).toBeDefined();
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await fetch(`${baseUrl}/api/model-battle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json"
    });
    expect(res.status).toBe(400);
  });
});

describe("Admin Endpoints", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await fetch(`${baseUrl}/api/admin/chat-logs`);
    // Without ADMIN_API_KEY env, returns 503
    expect([401, 503]).toContain(res.status);
  });
});

describe("GDPR Endpoints", () => {
  it("GET /api/my-data requires session", async () => {
    const res = await fetch(`${baseUrl}/api/my-data`);
    expect(res.status).toBe(400);
  });

  it("DELETE /api/my-data requires session", async () => {
    const res = await fetch(`${baseUrl}/api/my-data`, { method: "DELETE" });
    expect(res.status).toBe(400);
  });
});
