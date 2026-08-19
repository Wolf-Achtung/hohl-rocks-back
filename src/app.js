// ===================================================================
// EXPRESS APP SETUP
// ===================================================================

import express from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import { NODE_ENV, ALLOWED_ORIGINS } from "./config/env.js";
import { log } from "./utils/logger.js";

// Routes
import healthRoutes from "./routes/health.js";
import modelBattleRoutes from "./routes/modelBattle.js";
import chatRoutes from "./routes/chat.js";
import klartextRoutes from "./routes/klartext.js";
import promptRoutes from "./routes/prompts.js";
import contentRoutes from "./routes/content.js";
import adminRoutes from "./routes/admin.js";
import gdprRoutes from "./routes/gdpr.js";

// Error handlers
import { notFoundHandler, globalErrorHandler } from "./middleware/errorHandler.js";

const app = express();

// Railway terminates TLS and proxies exactly one hop in front of the app.
// Without this, req.ip is always the proxy's IP, so all users would share
// the same rate-limit buckets and chat-log IPs would be meaningless.
app.set("trust proxy", 1);

// ===================================================================
// REQUEST LOGGING
// ===================================================================

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (NODE_ENV === "development" || res.statusCode >= 400) {
      log.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// ===================================================================
// MIDDLEWARE
// ===================================================================

app.use(compression({ level: 6, threshold: 1024 }));
// Largest accepted payload is a chat history capped at 4000 chars, so a
// tight body limit closes an otherwise pointless parsing-DoS vector.
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

// CORS - Liste siehe config/env.js
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Key", "X-Requested-With"]
}));

// Security headers
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
  next();
});

// ===================================================================
// ROUTES
// ===================================================================

app.use(healthRoutes);
app.use(modelBattleRoutes);
app.use(chatRoutes);
app.use(klartextRoutes);
app.use(promptRoutes);
app.use(contentRoutes);
app.use(adminRoutes);
app.use(gdprRoutes);

// ===================================================================
// ERROR HANDLERS
// ===================================================================

app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
