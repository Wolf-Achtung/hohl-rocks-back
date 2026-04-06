import { describe, it, expect } from "vitest";
import { sanitizePrompt, withTimeout } from "../src/utils/helpers.js";

describe("sanitizePrompt", () => {
  it("removes script tags", () => {
    const input = 'Hello <script>alert("xss")</script> World';
    expect(sanitizePrompt(input)).toBe("Hello  World");
  });

  it("removes HTML tags", () => {
    expect(sanitizePrompt("Hello <b>bold</b> World")).toBe("Hello bold World");
  });

  it("trims whitespace", () => {
    expect(sanitizePrompt("  hello  ")).toBe("hello");
  });

  it("handles empty strings", () => {
    expect(sanitizePrompt("")).toBe("");
  });

  it("preserves normal text", () => {
    expect(sanitizePrompt("Erkläre mir Machine Learning")).toBe("Erkläre mir Machine Learning");
  });

  it("handles nested script tags", () => {
    const input = '<script><script>nested</script></script>text';
    const result = sanitizePrompt(input);
    expect(result).not.toContain("<script>");
  });
});

describe("withTimeout", () => {
  it("resolves when promise completes before timeout", async () => {
    const promise = new Promise(resolve => setTimeout(() => resolve("ok"), 10));
    const result = await withTimeout(promise, 1000, "Test");
    expect(result).toBe("ok");
  });

  it("rejects when promise exceeds timeout", async () => {
    const promise = new Promise(resolve => setTimeout(() => resolve("ok"), 5000));
    await expect(withTimeout(promise, 50, "Test")).rejects.toThrow("Test timeout after 50ms");
  });
});
