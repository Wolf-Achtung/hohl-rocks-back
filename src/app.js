// ===================================================================
// EXPRESS APP SETUP
// ===================================================================

import express from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import { NODE_ENV } from "./config/env.js";
import { log } from "./utils/logger.js";

// Routes
import healthRoutes from "./routes/health.js";
import modelBattleRoutes from "./routes/modelBattle.js";
import chatRoutes from "./routes/chat.js";
import promptRoutes from "./routes/prompts.js";
import contentRoutes from "./routes/content.js";
import adminRoutes from "./routes/admin.js";
import gdprRoutes from "./routes/gdpr.js";

// Error handlers
import { notFoundHandler, globalErrorHandler } from "./middleware/errorHandler.js";

const app = express();

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
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// CORS
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "https://hohl.rocks",
  "https://www.hohl.rocks",
];

// Dynamic origins from env
if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',').forEach(origin => {
    ALLOWED_ORIGINS.push(origin.trim());
  });
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    // Allow Netlify/Railway preview deployments
    if (/\.netlify\.app$/.test(origin) || /\.railway\.app$/.test(origin)) {
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
