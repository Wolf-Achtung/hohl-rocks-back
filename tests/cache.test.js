import { describe, it, expect, vi } from "vitest";
import { createCache } from "../src/utils/cache.js";

describe("createCache", () => {
  it("stores and retrieves values", () => {
    const cache = createCache(60000);
    cache.set("key1", { data: "test" });
    expect(cache.get("key1")).toEqual({ data: "test" });
  });

  it("returns null for missing keys", () => {
    const cache = createCache(60000);
    expect(cache.get("nonexistent")).toBeNull();
  });

  it("expires entries after TTL", () => {
    vi.useFakeTimers();
    const cache = createCache(100); // 100ms TTL
    cache.set("key1", "value");

    expect(cache.get("key1")).toBe("value");

    vi.advanceTimersByTime(150);
    expect(cache.get("key1")).toBeNull();

    vi.useRealTimers();
  });

  it("separate cache instances don't interfere", () => {
    const cache1 = createCache(60000);
    const cache2 = createCache(60000);

    cache1.set("key", "value1");
    cache2.set("key", "value2");

    expect(cache1.get("key")).toBe("value1");
    expect(cache2.get("key")).toBe("value2");
  });

  it("clear removes only own entries", () => {
    const cache1 = createCache(60000);
    const cache2 = createCache(60000);

    cache1.set("key", "value1");
    cache2.set("key", "value2");

    cache1.clear();
    expect(cache1.get("key")).toBeNull();
    expect(cache2.get("key")).toBe("value2");
  });
});
