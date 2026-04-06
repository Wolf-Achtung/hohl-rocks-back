// ===================================================================
// RATE LIMITING (In-Memory)
// ===================================================================

const rateLimitStore = new Map();

// Cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore) {
    if (now - data.windowStart > 60000) {
      rateLimitStore.delete(key);
    }
  }
}, 300000);

export function createRateLimiter(maxRequests, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);

    if (!record || (now - record.windowStart) > windowMs) {
      record = { count: 1, windowStart: now };
      rateLimitStore.set(key, record);
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.windowStart + windowMs - now) / 1000);
      return res.status(429).json({
        error: "Too Many Requests",
        message: `Rate limit exceeded. Max ${maxRequests} requests per minute.`,
        retryAfter,
        timestamp: new Date().toISOString()
      });
    }

    record.count++;
    next();
  };
}

// Pre-configured rate limiters
export const modelBattleRateLimit = createRateLimiter(10, 60000);    // 10 req/min
export const promptGeneratorRateLimit = createRateLimiter(20, 60000); // 20 req/min
export const promptLibraryRateLimit = createRateLimiter(60, 60000);   // 60 req/min
export const generalRateLimit = createRateLimiter(30, 60000);         // 30 req/min
export const adminRateLimit = createRateLimiter(30, 60000);           // 30 req/min
export const gdprRateLimit = createRateLimiter(10, 60000);            // 10 req/min
