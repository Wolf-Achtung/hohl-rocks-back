// ===================================================================
// AUTHENTICATION MIDDLEWARE
// ===================================================================

import crypto from "crypto";
import { ADMIN_API_KEY } from "../config/env.js";

// Constant-time comparison to avoid leaking the admin key via response-time
// differences. Buffers must be equal length for timingSafeEqual, so a length
// mismatch is checked (and short-circuited) before it - the key's length
// isn't sensitive the way its content is.
function timingSafeEquals(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function adminAuth(req, res, next) {
  const apiKey = req.headers['x-admin-key'];

  if (!ADMIN_API_KEY) {
    return res.status(503).json({
      error: 'Admin API not configured',
      message: 'ADMIN_API_KEY environment variable not set'
    });
  }

  if (!apiKey || !timingSafeEquals(apiKey, ADMIN_API_KEY)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
