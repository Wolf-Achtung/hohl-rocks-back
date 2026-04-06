// ===================================================================
// AUTHENTICATION MIDDLEWARE
// ===================================================================

import { ADMIN_API_KEY } from "../config/env.js";

export function adminAuth(req, res, next) {
  const apiKey = req.headers['x-admin-key'];

  if (!ADMIN_API_KEY) {
    return res.status(503).json({
      error: 'Admin API not configured',
      message: 'ADMIN_API_KEY environment variable not set'
    });
  }

  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
